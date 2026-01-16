require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { GoogleGenAI, Modality, MediaResolution } = require('@google/genai');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Check API Key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set!');
    process.exit(1);
}

console.log('✅ API Key configured');

// Initialize Google GenAI
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Live API config - matching the example exactly
const MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';
const CONFIG = {
    responseModalities: [Modality.AUDIO],
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    speechConfig: {
        voiceConfig: {
            prebuiltVoiceConfig: {
                voiceName: 'Zephyr',
            }
        }
    },
    systemInstruction: {
        parts: [{
            text: `你是一个专业的同声传译员。

规则：
1. 听到中文，直接翻译成英文
2. 听到英文，直接翻译成中文
3. 只输出翻译结果，不要解释、不要思考过程
4. 保持简洁，像真人翻译一样自然
5. 不要输出任何markdown格式如**粗体**

示例：
用户说：你好，今天天气真好
你只说：Hello, the weather is really nice today

用户说：I'm working on a translation app
你只说：我正在开发一个翻译应用`
        }]
    }
};

// Handle WebSocket connections from browser
wss.on('connection', async (browserWs) => {
    console.log('Browser client connected');

    let session = null;
    const responseQueue = [];

    try {
        // Connect to Gemini Live API using official SDK
        session = await ai.live.connect({
            model: MODEL,
            config: CONFIG,
            callbacks: {
                onopen: () => {
                    console.log('✅ Gemini session opened');
                    browserWs.send(JSON.stringify({ type: 'status', status: 'ready' }));
                },
                onmessage: (message) => {
                    console.log('Gemini message received');

                    // Handle server content
                    if (message.serverContent) {
                        const content = message.serverContent;

                        // Handle interruption
                        if (content.interrupted) {
                            console.log('Interrupted');
                            browserWs.send(JSON.stringify({ type: 'interrupted' }));
                            return;
                        }

                        // Handle model response
                        if (content.modelTurn && content.modelTurn.parts) {
                            for (const part of content.modelTurn.parts) {
                                // Text response
                                if (part.text) {
                                    console.log('Text:', part.text);
                                    browserWs.send(JSON.stringify({
                                        type: 'text',
                                        text: part.text
                                    }));
                                }

                                // Audio response
                                if (part.inlineData && part.inlineData.data) {
                                    browserWs.send(JSON.stringify({
                                        type: 'audio',
                                        data: part.inlineData.data,
                                        mimeType: part.inlineData.mimeType
                                    }));
                                }
                            }
                        }

                        // Turn complete
                        if (content.turnComplete) {
                            console.log('Turn complete');
                            browserWs.send(JSON.stringify({ type: 'turnComplete' }));
                        }
                    }
                },
                onerror: (error) => {
                    console.error('Gemini error:', error.message);
                    browserWs.send(JSON.stringify({
                        type: 'error',
                        message: error.message
                    }));
                },
                onclose: (event) => {
                    console.log('Gemini connection closed:', event.reason);
                    browserWs.send(JSON.stringify({
                        type: 'status',
                        status: 'disconnected'
                    }));
                },
            },
        });

        console.log('Session created successfully');

    } catch (error) {
        console.error('Failed to connect to Gemini:', error);
        browserWs.send(JSON.stringify({
            type: 'error',
            message: 'Failed to connect: ' + error.message
        }));
        return;
    }

    // Handle messages from browser
    browserWs.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'audio' && session) {
                // Send realtime audio input
                session.sendRealtimeInput({
                    media: {
                        data: data.data,
                        mimeType: 'audio/pcm;rate=16000'
                    }
                });
            }
        } catch (err) {
            console.error('Error handling browser message:', err);
        }
    });

    browserWs.on('close', () => {
        console.log('Browser client disconnected');
        if (session) {
            session.close();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Server running at http://localhost:${PORT}`);
    console.log('📡 WebSocket server ready for connections');
});
