require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Serve the volcengine version as default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index-volcengine.html'));
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Check API Keys
const VOLC_APP_ID = process.env.VOLC_APP_ID;
const VOLC_ACCESS_KEY = process.env.VOLC_ACCESS_KEY;

if (!VOLC_APP_ID || !VOLC_ACCESS_KEY) {
    console.error('❌ VOLC_APP_ID or VOLC_ACCESS_KEY is not set!');
    console.error('Please add the following to your .env file:');
    console.error('VOLC_APP_ID=your_app_id');
    console.error('VOLC_ACCESS_KEY=your_access_key');
    console.error('');
    console.error('Get these from the Volcengine console: 控制台 -> 语音技术 -> 同声传译');
    process.exit(1);
}

console.log('✅ Volcengine API credentials configured');

// 火山引擎同声传译 WebSocket API 配置
const VOLC_AST_WSS_URL = 'wss://openspeech.bytedance.com/api/v4/ast/v2/translate';

// Manual protobuf encoding/decoding based on the Python example
// Since protobufjs is having issues with the proto files, we'll use a simpler approach

// Event type constants
const EventType = {
    None: 0,
    StartSession: 100,
    CancelSession: 101,
    FinishSession: 102,
    SessionStarted: 150,
    SessionCanceled: 151,
    SessionFinished: 152,
    SessionFailed: 153,
    UsageResponse: 154,
    TaskRequest: 200,
    UpdateConfig: 201,
    AudioMuted: 250,
    TTSSentenceStart: 350,
    TTSSentenceEnd: 351,
    TTSResponse: 352,
    SourceSubtitleStart: 650,
    SourceSubtitleResponse: 651,
    SourceSubtitleEnd: 652,
    TranslationSubtitleStart: 653,
    TranslationSubtitleResponse: 654,
    TranslationSubtitleEnd: 655,
};

const EventNames = Object.fromEntries(Object.entries(EventType).map(([k, v]) => [v, k]));

// Simple protobuf writer for basic types
class ProtobufWriter {
    constructor() {
        this.parts = [];
    }

    writeVarint(value) {
        const bytes = [];
        while (value > 127) {
            bytes.push((value & 0x7f) | 0x80);
            value >>>= 7;
        }
        bytes.push(value);
        this.parts.push(Buffer.from(bytes));
        return this;
    }

    writeTag(fieldNumber, wireType) {
        return this.writeVarint((fieldNumber << 3) | wireType);
    }

    writeString(fieldNumber, value) {
        if (!value) return this;
        const bytes = Buffer.from(value, 'utf8');
        this.writeTag(fieldNumber, 2); // wire type 2 = length-delimited
        this.writeVarint(bytes.length);
        this.parts.push(bytes);
        return this;
    }

    writeBytes(fieldNumber, value) {
        if (!value || value.length === 0) return this;
        this.writeTag(fieldNumber, 2);
        this.writeVarint(value.length);
        this.parts.push(value);
        return this;
    }

    writeInt32(fieldNumber, value) {
        if (value === 0 || value === undefined) return this;
        this.writeTag(fieldNumber, 0); // wire type 0 = varint
        this.writeVarint(value);
        return this;
    }

    writeMessage(fieldNumber, messageWriter) {
        const messageBytes = messageWriter.toBuffer();
        if (messageBytes.length === 0) return this;
        this.writeTag(fieldNumber, 2);
        this.writeVarint(messageBytes.length);
        this.parts.push(messageBytes);
        return this;
    }

    toBuffer() {
        return Buffer.concat(this.parts);
    }
}

// Build TranslateRequest protobuf message
function buildTranslateRequest(options) {
    const writer = new ProtobufWriter();

    // Field 1: request_meta
    if (options.sessionId) {
        const metaWriter = new ProtobufWriter();
        metaWriter.writeString(6, options.sessionId); // SessionID is field 6 in RequestMeta
        writer.writeMessage(1, metaWriter);
    }

    // Field 2: event (enum/int32)
    writer.writeInt32(2, options.event);

    // Field 3: user
    if (options.user) {
        const userWriter = new ProtobufWriter();
        userWriter.writeString(1, options.user.uid);
        userWriter.writeString(2, options.user.did);
        userWriter.writeString(3, options.user.platform);
        userWriter.writeString(4, options.user.sdkVersion);
        writer.writeMessage(3, userWriter);
    }

    // Field 4: source_audio
    if (options.sourceAudio) {
        const audioWriter = new ProtobufWriter();
        if (options.sourceAudio.format) audioWriter.writeString(4, options.sourceAudio.format);
        if (options.sourceAudio.rate) audioWriter.writeInt32(7, options.sourceAudio.rate);
        if (options.sourceAudio.bits) audioWriter.writeInt32(8, options.sourceAudio.bits);
        if (options.sourceAudio.channel) audioWriter.writeInt32(9, options.sourceAudio.channel);
        if (options.sourceAudio.binaryData) audioWriter.writeBytes(14, options.sourceAudio.binaryData);
        writer.writeMessage(4, audioWriter);
    }

    // Field 5: target_audio
    if (options.targetAudio) {
        const audioWriter = new ProtobufWriter();
        if (options.targetAudio.format) audioWriter.writeString(4, options.targetAudio.format);
        if (options.targetAudio.rate) audioWriter.writeInt32(7, options.targetAudio.rate);
        writer.writeMessage(5, audioWriter);
    }

    // Field 6: request (ReqParams)
    if (options.request) {
        const reqWriter = new ProtobufWriter();
        if (options.request.mode) reqWriter.writeString(1, options.request.mode);
        if (options.request.sourceLanguage) reqWriter.writeString(2, options.request.sourceLanguage);
        if (options.request.targetLanguage) reqWriter.writeString(3, options.request.targetLanguage);
        writer.writeMessage(6, reqWriter);
    }

    return writer.toBuffer();
}

// Simple protobuf reader for basic types
class ProtobufReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }

    readVarint() {
        let result = 0;
        let shift = 0;
        while (this.offset < this.buffer.length) {
            const byte = this.buffer[this.offset++];
            result |= (byte & 0x7f) << shift;
            if ((byte & 0x80) === 0) break;
            shift += 7;
        }
        return result;
    }

    readBytes(length) {
        const bytes = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
    }

    readString(length) {
        return this.readBytes(length).toString('utf8');
    }

    hasMore() {
        return this.offset < this.buffer.length;
    }
}

// Parse TranslateResponse protobuf message
function parseTranslateResponse(buffer) {
    const reader = new ProtobufReader(buffer);
    const result = {
        event: 0,
        text: '',
        data: Buffer.alloc(0),
        responseMeta: {
            SessionID: '',
            Sequence: 0,
            Message: ''
        },
        startTime: 0,
        endTime: 0,
        spkChg: false
    };

    while (reader.hasMore()) {
        const tag = reader.readVarint();
        const fieldNumber = tag >>> 3;
        const wireType = tag & 0x7;

        switch (wireType) {
            case 0: // Varint
                const varint = reader.readVarint();
                if (fieldNumber === 2) result.event = varint;
                else if (fieldNumber === 5) result.startTime = varint;
                else if (fieldNumber === 6) result.endTime = varint;
                else if (fieldNumber === 7) result.spkChg = varint !== 0;
                else if (fieldNumber === 8) result.mutedDurationMs = varint;
                break;
            case 2: // Length-delimited
                const length = reader.readVarint();
                const bytes = reader.readBytes(length);
                if (fieldNumber === 1) {
                    // Parse response_meta
                    const metaReader = new ProtobufReader(bytes);
                    while (metaReader.hasMore()) {
                        const metaTag = metaReader.readVarint();
                        const metaField = metaTag >>> 3;
                        const metaWire = metaTag & 0x7;
                        if (metaWire === 0) {
                            const val = metaReader.readVarint();
                            if (metaField === 2) result.responseMeta.Sequence = val;
                            else if (metaField === 3) result.responseMeta.StatusCode = val;
                        } else if (metaWire === 2) {
                            const len = metaReader.readVarint();
                            const str = metaReader.readString(len);
                            if (metaField === 1) result.responseMeta.SessionID = str;
                            else if (metaField === 4) result.responseMeta.Message = str;
                        }
                    }
                }
                else if (fieldNumber === 3) result.data = bytes;
                else if (fieldNumber === 4) result.text = bytes.toString('utf8');
                break;
            case 5: // 32-bit (skip 4 bytes)
                reader.offset += 4;
                break;
            case 1: // 64-bit (skip 8 bytes)
                reader.offset += 8;
                break;
        }
    }

    return result;
}

console.log('✅ Protobuf encoder/decoder ready');

// Handle WebSocket connections from browser
wss.on('connection', async (browserWs) => {
    console.log('Browser client connected');

    let volcWs = null;
    let sessionId = crypto.randomUUID();
    let connectId = crypto.randomUUID();
    let isSessionActive = false;
    let sourceLanguage = 'zh';
    let targetLanguage = 'en';

    // Browser message handler
    browserWs.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start') {
                sourceLanguage = data.sourceLanguage || 'zh';
                targetLanguage = data.targetLanguage || 'en';

                console.log(`Starting translation session: ${sourceLanguage} -> ${targetLanguage}`);
                console.log(`Session ID: ${sessionId}`);

                // Connect to Volcengine AST API with proper headers
                volcWs = new WebSocket(VOLC_AST_WSS_URL, {
                    headers: {
                        'X-Api-App-Key': VOLC_APP_ID,
                        'X-Api-Access-Key': VOLC_ACCESS_KEY,
                        'X-Api-Resource-Id': 'volc.service_type.10053',
                        'X-Api-Connect-Id': connectId,
                    }
                });

                volcWs.on('open', () => {
                    console.log('✅ Connected to Volcengine AST API');

                    // Build StartSession request
                    const buffer = buildTranslateRequest({
                        sessionId: sessionId,
                        event: EventType.StartSession,
                        user: {
                            uid: 'web_translator',
                            did: 'web_translator',
                            platform: 'web',
                            sdkVersion: '1.0.0',
                        },
                        sourceAudio: {
                            format: 'wav',
                            rate: 16000,
                            bits: 16,
                            channel: 1,
                        },
                        targetAudio: {
                            format: 'ogg_opus',
                            rate: 24000,
                        },
                        request: {
                            mode: 's2s',
                            sourceLanguage: sourceLanguage,
                            targetLanguage: targetLanguage,
                        },
                    });

                    volcWs.send(buffer);
                    console.log('📤 Session started');
                });

                volcWs.on('message', (volcMessage) => {
                    try {
                        const response = parseTranslateResponse(Buffer.from(volcMessage));
                        const eventName = EventNames[response.event] || `Unknown`;

                        // Handle different events
                        switch (response.event) {
                            case EventType.SessionStarted:
                                console.log('✅ Session ready');
                                isSessionActive = true;
                                browserWs.send(JSON.stringify({ type: 'status', status: 'ready' }));
                                break;

                            case EventType.SessionFailed:
                                console.error('Session failed:', response.responseMeta?.Message);
                                browserWs.send(JSON.stringify({
                                    type: 'error',
                                    message: response.responseMeta?.Message || 'Session failed'
                                }));
                                break;

                            case EventType.SessionFinished:
                                console.log('✅ Session finished');
                                isSessionActive = false;
                                browserWs.send(JSON.stringify({ type: 'turnComplete' }));
                                break;

                            case EventType.SourceSubtitleEnd:
                                // Only log final ASR result
                                if (response.text) {
                                    console.log(`🎤 原文: ${response.text}`);
                                    browserWs.send(JSON.stringify({
                                        type: 'asr',
                                        text: response.text,
                                        isFinal: true,
                                        sequence: response.responseMeta?.Sequence
                                    }));
                                }
                                break;

                            case EventType.SourceSubtitleStart:
                            case EventType.SourceSubtitleResponse:
                                if (response.text) {
                                    browserWs.send(JSON.stringify({
                                        type: 'asr',
                                        text: response.text,
                                        isFinal: response.event === EventType.SourceSubtitleEnd,
                                        sequence: response.responseMeta?.Sequence
                                    }));
                                }
                                break;

                            case EventType.TranslationSubtitleEnd:
                                // Only log final translation result
                                if (response.text) {
                                    console.log(`🔄 译文: ${response.text}`);
                                    browserWs.send(JSON.stringify({
                                        type: 'translation',
                                        text: response.text,
                                        language: targetLanguage,
                                        isFinal: true,
                                        sequence: response.responseMeta?.Sequence
                                    }));
                                }
                                break;

                            case EventType.TranslationSubtitleStart:
                            case EventType.TranslationSubtitleResponse:
                                if (response.text) {
                                    browserWs.send(JSON.stringify({
                                        type: 'translation',
                                        text: response.text,
                                        language: targetLanguage,
                                        isFinal: false,
                                        sequence: response.responseMeta?.Sequence
                                    }));
                                }
                                break;

                            case EventType.TTSSentenceStart:
                            case EventType.TTSResponse:
                            case EventType.TTSSentenceEnd:
                                if (response.data && response.data.length > 0) {
                                    browserWs.send(JSON.stringify({
                                        type: 'audio',
                                        data: response.data.toString('base64'),
                                        format: 'opus',
                                        sampleRate: 24000
                                    }));
                                }
                                break;

                            case EventType.UsageResponse:
                                // Silent - don't log usage
                                break;

                            case EventType.None:
                                if (response.responseMeta?.Message) {
                                    console.log('Server message:', response.responseMeta.Message);
                                }
                                break;
                        }
                    } catch (err) {
                        console.error('Error decoding Volcengine message:', err);
                        console.error('Raw message (hex):', Buffer.from(volcMessage).slice(0, 100).toString('hex'));
                    }
                });

                volcWs.on('error', (error) => {
                    console.error('Volcengine WebSocket error:', error.message);
                    browserWs.send(JSON.stringify({
                        type: 'error',
                        message: 'Connection error: ' + error.message
                    }));
                });

                volcWs.on('close', (code, reason) => {
                    console.log(`Volcengine WebSocket closed: ${code} - ${reason}`);
                    isSessionActive = false;
                    browserWs.send(JSON.stringify({
                        type: 'status',
                        status: 'disconnected'
                    }));
                });

            } else if (data.type === 'audio' && volcWs && volcWs.readyState === WebSocket.OPEN && isSessionActive) {
                const audioBuffer = Buffer.from(data.data, 'base64');

                const buffer = buildTranslateRequest({
                    sessionId: sessionId,
                    event: EventType.TaskRequest,
                    sourceAudio: {
                        binaryData: audioBuffer,
                    },
                });

                volcWs.send(buffer);

            } else if (data.type === 'stop' && volcWs && volcWs.readyState === WebSocket.OPEN && isSessionActive) {
                const buffer = buildTranslateRequest({
                    sessionId: sessionId,
                    event: EventType.FinishSession,
                });

                volcWs.send(buffer);
                console.log('Sent FinishSession request');
            }
        } catch (err) {
            console.error('Error handling browser message:', err);
        }
    });

    browserWs.on('close', () => {
        console.log('Browser client disconnected');
        if (volcWs && volcWs.readyState === WebSocket.OPEN) {
            if (isSessionActive) {
                try {
                    const buffer = buildTranslateRequest({
                        sessionId: sessionId,
                        event: EventType.FinishSession,
                    });
                    volcWs.send(buffer);
                } catch (e) {
                    // Ignore errors during cleanup
                }
            }
            volcWs.close();
        }
    });

    browserWs.on('error', (error) => {
        console.error('Browser WebSocket error:', error);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Server running at http://localhost:${PORT}`);
    console.log('📡 WebSocket server ready for connections');
    console.log('🔊 Using Volcengine AST 2.0 API (Manual Protobuf)');
});
