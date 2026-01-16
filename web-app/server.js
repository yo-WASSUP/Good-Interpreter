require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Gemini Live API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_INSTRUCTION = `用户语言是中文，你就用英语翻译（模仿用户的语音语调）
用户语言是英语，你就用中文翻译（模仿用户的语音语调）
自动识别用户语言，不需要询问用户直接翻译即可。
同时，请在翻译时输出原文和译文的文字版本，格式如下：
[原文] xxx
[译文] xxx`;

// Handle WebSocket connections from browser
wss.on('connection', (browserWs) => {
    console.log('Browser client connected');

    let geminiWs = null;
    let isSetupComplete = false;

    // Connect to Gemini Live API
    const connectToGemini = () => {
        geminiWs = new WebSocket(GEMINI_WS_URL);

        geminiWs.on('open', () => {
            console.log('Connected to Gemini Live API');

            // Send setup message
            const setupMessage = {
                setup: {
                    model: GEMINI_MODEL,
                    generation_config: {
                        response_modalities: ["AUDIO", "TEXT"]
                    },
                    system_instruction: {
                        parts: [{ text: SYSTEM_INSTRUCTION }]
                    }
                }
            };

            geminiWs.send(JSON.stringify(setupMessage));
        });

        geminiWs.on('message', (data) => {
            try {
                const response = JSON.parse(data.toString());

                // Check for setup completion
                if (response.setupComplete) {
                    isSetupComplete = true;
                    console.log('Gemini setup complete');
                    browserWs.send(JSON.stringify({ type: 'status', status: 'ready' }));
                    return;
                }

                // Handle server content (audio and text responses)
                if (response.serverContent) {
                    const content = response.serverContent;

                    if (content.modelTurn && content.modelTurn.parts) {
                        for (const part of content.modelTurn.parts) {
                            // Handle text response
                            if (part.text) {
                                browserWs.send(JSON.stringify({
                                    type: 'text',
                                    text: part.text
                                }));
                            }

                            // Handle audio response
                            if (part.inlineData) {
                                browserWs.send(JSON.stringify({
                                    type: 'audio',
                                    mimeType: part.inlineData.mimeType,
                                    data: part.inlineData.data
                                }));
                            }
                        }
                    }

                    // Handle turn completion
                    if (content.turnComplete) {
                        browserWs.send(JSON.stringify({ type: 'turnComplete' }));
                    }
                }
            } catch (err) {
                console.error('Error parsing Gemini response:', err);
            }
        });

        geminiWs.on('error', (error) => {
            console.error('Gemini WebSocket error:', error);
            browserWs.send(JSON.stringify({ type: 'error', message: 'Gemini connection error' }));
        });

        geminiWs.on('close', () => {
            console.log('Gemini connection closed');
            isSetupComplete = false;
        });
    };

    connectToGemini();

    // Handle messages from browser
    browserWs.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (!isSetupComplete) {
                console.log('Waiting for Gemini setup...');
                return;
            }

            if (data.type === 'audio') {
                // Forward audio to Gemini
                const realtimeInput = {
                    realtimeInput: {
                        mediaChunks: [{
                            mimeType: 'audio/pcm;rate=16000',
                            data: data.data
                        }]
                    }
                };

                if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                    geminiWs.send(JSON.stringify(realtimeInput));
                }
            }
        } catch (err) {
            console.error('Error handling browser message:', err);
        }
    });

    browserWs.on('close', () => {
        console.log('Browser client disconnected');
        if (geminiWs) {
            geminiWs.close();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Server running at http://localhost:${PORT}`);
    console.log('📡 WebSocket server ready for connections');
});
