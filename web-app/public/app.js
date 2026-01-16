// ===== DOM Elements =====
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const statusBadge = document.getElementById('statusBadge');
const emptyState = document.getElementById('emptyState');
const subtitlesWrapper = document.getElementById('subtitlesWrapper');
const originalText = document.getElementById('originalText');
const translatedText = document.getElementById('translatedText');
const audioVisualizer = document.getElementById('audioVisualizer');

// ===== State =====
let ws = null;
let mediaRecorder = null;
let audioContext = null;
let isRecording = false;
let audioQueue = [];
let isPlaying = false;
let currentText = '';  // Current accumulated text

// ===== WebSocket Connection =====
function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        updateStatus('connecting', '正在初始化...');
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'status':
                if (data.status === 'ready') {
                    updateStatus('connected', '已连接');
                } else if (data.status === 'disconnected') {
                    updateStatus('disconnected', '已断开');
                }
                break;

            case 'text':
                handleTextResponse(data.text);
                break;

            case 'audio':
                await handleAudioResponse(data);
                break;

            case 'turnComplete':
                handleTurnComplete();
                break;

            case 'interrupted':
                console.log('Interrupted');
                break;

            case 'error':
                console.error('Server error:', data.message);
                updateStatus('error', '连接错误');
                break;
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateStatus('disconnected', '已断开');
        stopRecording();
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateStatus('error', '连接错误');
    };
}

// ===== Status Update =====
function updateStatus(status, text) {
    const statusText = statusBadge.querySelector('.status-text');
    statusText.textContent = text;

    statusBadge.className = 'status-badge';
    if (status === 'connected' || status === 'ready') {
        statusBadge.classList.add('connected');
    } else if (status === 'recording') {
        statusBadge.classList.add('recording');
    }
}

// ===== Audio Recording =====
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
        });

        audioContext = new AudioContext({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
            if (!isRecording || !ws || ws.readyState !== WebSocket.OPEN) return;

            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = convertFloat32ToInt16(inputData);
            const base64Data = arrayBufferToBase64(pcmData.buffer);

            ws.send(JSON.stringify({
                type: 'audio',
                data: base64Data
            }));
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        isRecording = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        audioVisualizer.classList.add('active');
        updateStatus('recording', '正在录音...');
        emptyState.classList.add('hidden');

    } catch (error) {
        console.error('Error starting recording:', error);
        alert('无法访问麦克风，请检查权限设置');
    }
}

function stopRecording() {
    isRecording = false;

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    startBtn.disabled = false;
    stopBtn.disabled = true;
    audioVisualizer.classList.remove('active');

    if (ws && ws.readyState === WebSocket.OPEN) {
        updateStatus('connected', '已连接');
    } else {
        updateStatus('disconnected', '已断开');
    }
}

// ===== Audio Conversion Utils =====
function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// ===== Handle Responses =====
let currentOriginal = '';
let currentTranslation = '';

function handleTextResponse(text) {
    console.log('Received text:', text);

    // Extract both original and translation from model output
    const result = extractBilingual(text);

    if (result) {
        currentOriginal = result.original;
        currentTranslation = result.translation;

        // Update the current display
        originalText.textContent = currentOriginal || '-';
        translatedText.textContent = currentTranslation || '-';
    }
}

// Extract both original and translated text from model's verbose output
function extractBilingual(text) {
    // The model outputs patterns like:
    // "我想跟你开一个会议" -> "I'd like to have a meeting with you"
    // or: The original request, "中文内容," now reads, "English content."
    // The FIRST quoted text is always what the user said (original)
    // The SECOND quoted text is the translation

    // Find all quoted strings in order
    const allQuotes = [...text.matchAll(/"([^"]+)"/g)].map(m => m[1]);

    if (allQuotes.length >= 2) {
        // First quote is original (what user said), second is translation
        return {
            original: allQuotes[0],
            translation: allQuotes[1]
        };
    }

    // If only one quote found, try to determine what it is
    if (allQuotes.length === 1) {
        const quote = allQuotes[0];
        const hasChinese = /[\u4e00-\u9fa5]/.test(quote);

        // If we already have an original, this must be the translation
        if (currentOriginal) {
            return { original: currentOriginal, translation: quote };
        } else {
            return { original: quote, translation: '' };
        }
    }

    return null;
}

function handleTurnComplete() {
    // When turn is complete, save to history if we have content
    if (currentOriginal || currentTranslation) {
        addSubtitleItem(currentOriginal, currentTranslation);
    }

    // Reset for next turn
    currentOriginal = '';
    currentTranslation = '';
    originalText.textContent = '-';
    translatedText.textContent = '-';
}

function addSubtitleItem(original, translation) {
    const item = document.createElement('div');
    item.className = 'subtitle-item';

    // Get current timestamp
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Determine which is source and which is target based on content
    const hasChinese = /[\u4e00-\u9fa5]/.test(original);
    const sourceLabel = hasChinese ? '中文' : 'EN';
    const targetLabel = hasChinese ? 'EN' : '中文';

    item.innerHTML = `
        <div class="subtitle-header">
            <span class="subtitle-time">${timeStr}</span>
        </div>
        <div class="subtitle-bilingual">
            <div class="subtitle-source">
                <span class="lang-tag source-tag">${sourceLabel}</span>
                <p class="subtitle-text source-text">${escapeHtml(original || '-')}</p>
            </div>
            <div class="subtitle-arrow">→</div>
            <div class="subtitle-target">
                <span class="lang-tag target-tag">${targetLabel}</span>
                <p class="subtitle-text target-text">${escapeHtml(translation || '-')}</p>
            </div>
        </div>
    `;

    subtitlesWrapper.appendChild(item);
    subtitlesWrapper.scrollTop = subtitlesWrapper.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Audio Playback =====
async function handleAudioResponse(data) {
    const audioData = base64ToArrayBuffer(data.data);
    audioQueue.push(audioData);

    if (!isPlaying) {
        playAudioQueue();
    }
}

async function playAudioQueue() {
    if (audioQueue.length === 0) {
        isPlaying = false;
        return;
    }

    isPlaying = true;
    const audioData = audioQueue.shift();

    try {
        const playbackContext = new AudioContext({ sampleRate: 24000 });

        // Convert Int16 PCM to Float32
        const int16Array = new Int16Array(audioData);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        const audioBuffer = playbackContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.copyToChannel(float32Array, 0);

        const source = playbackContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(playbackContext.destination);

        source.onended = () => {
            playbackContext.close();
            playAudioQueue();
        };

        source.start();
    } catch (error) {
        console.error('Error playing audio:', error);
        isPlaying = false;
    }
}

// ===== Clear History =====
function clearHistory() {
    subtitlesWrapper.innerHTML = '';
    translatedText.textContent = '-';
    currentText = '';
    emptyState.classList.remove('hidden');
}

// ===== Event Listeners =====
startBtn.addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        // Wait for connection before starting
        const checkConnection = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                clearInterval(checkConnection);
                setTimeout(startRecording, 500); // Give Gemini setup time
            }
        }, 100);
    } else {
        startRecording();
    }
});

stopBtn.addEventListener('click', stopRecording);
clearBtn.addEventListener('click', clearHistory);

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    updateStatus('disconnected', '等待连接');
});
