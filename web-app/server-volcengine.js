require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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
    process.exit(1);
}

console.log('✅ Volcengine API credentials configured');

// 火山引擎同声传译 WebSocket API 配置
const VOLC_AST_WSS_URL = 'wss://openspeech.bytedance.com/api/v4/ast/v2/translate';

// Generate unique request ID
function generateRequestId() {
    return `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// Handle WebSocket connections from browser
wss.on('connection', async (browserWs) => {
    console.log('Browser client connected');

    let volcWs = null;
    let sessionId = generateRequestId();
    let isSessionActive = false;

    // Browser message handler
    browserWs.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start') {
                // Start a new translation session
                const sourceLanguage = data.sourceLanguage || 'zh';  // 默认中文
                const targetLanguage = data.targetLanguage || 'en';  // 默认英文

                console.log(`Starting translation session: ${sourceLanguage} -> ${targetLanguage}`);

                // Connect to Volcengine AST API
                volcWs = new WebSocket(VOLC_AST_WSS_URL, {
                    headers: {
                        'X-Api-App-Key': VOLC_APP_ID,
                        'X-Api-Access-Key': VOLC_ACCESS_KEY,
                    }
                });

                volcWs.on('open', () => {
                    console.log('✅ Connected to Volcengine AST API');
                    isSessionActive = true;

                    // Send initial configuration
                    const configMessage = {
                        header: {
                            app_id: VOLC_APP_ID,
                            request_id: sessionId,
                        },
                        payload: {
                            event: 'StartSession',
                            config: {
                                source_language: sourceLanguage,
                                target_languages: [targetLanguage],
                                enable_asr: true,
                                enable_translate: true,
                                enable_tts: true,
                                audio_config: {
                                    format: 'pcm',
                                    sample_rate: 16000,
                                    channel: 1,
                                    bits: 16,
                                }
                            }
                        }
                    };

                    volcWs.send(JSON.stringify(configMessage));
                    console.log('Sent configuration to Volcengine');

                    browserWs.send(JSON.stringify({ type: 'status', status: 'ready' }));
                });

                volcWs.on('message', (volcMessage) => {
                    try {
                        const response = JSON.parse(volcMessage.toString());
                        console.log('Volcengine response:', JSON.stringify(response).substring(0, 200));

                        // Handle different response types
                        if (response.payload) {
                            const payload = response.payload;

                            // ASR result (语音识别结果)
                            if (payload.asr_result) {
                                if (payload.asr_result.text) {
                                    browserWs.send(JSON.stringify({
                                        type: 'asr',
                                        text: payload.asr_result.text,
                                        isFinal: payload.asr_result.is_final || false
                                    }));
                                }
                            }

                            // Translation result (翻译结果)
                            if (payload.translate_result) {
                                const translateResult = payload.translate_result;
                                if (translateResult.text) {
                                    browserWs.send(JSON.stringify({
                                        type: 'translation',
                                        text: translateResult.text,
                                        language: translateResult.language || targetLanguage,
                                        isFinal: translateResult.is_final || false
                                    }));
                                }
                            }

                            // TTS result (语音合成结果)
                            if (payload.tts_result) {
                                if (payload.tts_result.audio) {
                                    browserWs.send(JSON.stringify({
                                        type: 'audio',
                                        data: payload.tts_result.audio,
                                        format: payload.tts_result.format || 'pcm',
                                        sampleRate: payload.tts_result.sample_rate || 24000
                                    }));
                                }
                            }

                            // Session events
                            if (payload.event === 'SessionStarted') {
                                console.log('Session started successfully');
                            } else if (payload.event === 'SessionFinished') {
                                console.log('Session finished');
                                browserWs.send(JSON.stringify({ type: 'turnComplete' }));
                            }

                            // Error handling
                            if (payload.error) {
                                console.error('Volcengine error:', payload.error);
                                browserWs.send(JSON.stringify({
                                    type: 'error',
                                    message: payload.error.message || 'Unknown error'
                                }));
                            }
                        }
                    } catch (err) {
                        console.error('Error parsing Volcengine message:', err);
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

            } else if (data.type === 'audio' && volcWs && isSessionActive) {
                // Send audio data to Volcengine
                const audioMessage = {
                    header: {
                        app_id: VOLC_APP_ID,
                        request_id: sessionId,
                    },
                    payload: {
                        event: 'AudioData',
                        audio: data.data  // Base64 encoded PCM audio
                    }
                };
                volcWs.send(JSON.stringify(audioMessage));

            } else if (data.type === 'stop' && volcWs && isSessionActive) {
                // End the session
                const endMessage = {
                    header: {
                        app_id: VOLC_APP_ID,
                        request_id: sessionId,
                    },
                    payload: {
                        event: 'FinishSession'
                    }
                };
                volcWs.send(JSON.stringify(endMessage));
                console.log('Sent finish session to Volcengine');
            }
        } catch (err) {
            console.error('Error handling browser message:', err);
        }
    });

    browserWs.on('close', () => {
        console.log('Browser client disconnected');
        if (volcWs) {
            // Send finish session before closing
            if (isSessionActive) {
                try {
                    const endMessage = {
                        header: {
                            app_id: VOLC_APP_ID,
                            request_id: sessionId,
                        },
                        payload: {
                            event: 'FinishSession'
                        }
                    };
                    volcWs.send(JSON.stringify(endMessage));
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
    console.log('🔊 Using Volcengine AST (Simultaneous Translation) API');
});
