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
const micSelect = document.getElementById('micSelect');
const refreshMicBtn = document.getElementById('refreshMicBtn');
const sourceLanguage = document.getElementById('sourceLanguage');
const targetLanguage = document.getElementById('targetLanguage');
const swapLangBtn = document.getElementById('swapLangBtn');

// ===== State =====
let ws = null;
let audioContext = null;
let isRecording = false;
let audioQueue = [];
let isPlaying = false;
let selectedDeviceId = null;
let currentAsrText = '';
let currentTranslationText = '';

// ===== WebSocket Connection =====
function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        updateStatus('connecting', '正在初始化...');

        // Send start message with language configuration
        ws.send(JSON.stringify({
            type: 'start',
            sourceLanguage: sourceLanguage.value,
            targetLanguage: targetLanguage.value
        }));
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

            case 'asr':
                // Handle speech recognition result (original text)
                handleAsrResult(data.text, data.isFinal);
                break;

            case 'translation':
                // Handle translation result
                handleTranslationResult(data.text, data.isFinal);
                break;

            case 'audio':
                // Handle TTS audio
                await handleAudioResponse(data);
                break;

            case 'turnComplete':
                handleTurnComplete();
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

// ===== Microphone Device Management =====
async function getMicrophoneDevices() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');

        micSelect.innerHTML = '<option value="">选择麦克风...</option>';

        audioInputs.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `麦克风 ${index + 1}`;
            micSelect.appendChild(option);
        });

        if (audioInputs.length > 0 && !selectedDeviceId) {
            const defaultDevice = audioInputs.find(d => d.deviceId === 'default') || audioInputs[0];
            micSelect.value = defaultDevice.deviceId;
            selectedDeviceId = defaultDevice.deviceId;
        } else if (selectedDeviceId) {
            micSelect.value = selectedDeviceId;
        }

        console.log(`Found ${audioInputs.length} microphone(s)`);
        return audioInputs;
    } catch (error) {
        console.error('Error getting microphone devices:', error);
        alert('无法获取麦克风列表，请检查权限设置');
        return [];
    }
}

function handleMicrophoneChange(event) {
    selectedDeviceId = event.target.value;
    console.log('Selected microphone:', selectedDeviceId);
}

// ===== Language Swap =====
function swapLanguages() {
    const sourceVal = sourceLanguage.value;
    const targetVal = targetLanguage.value;
    sourceLanguage.value = targetVal;
    targetLanguage.value = sourceVal;
}

// ===== Audio Recording =====
async function startRecording() {
    try {
        const audioConstraints = {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true
        };

        if (selectedDeviceId) {
            audioConstraints.deviceId = { exact: selectedDeviceId };
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints
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

    // Send stop signal to server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
    }

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
function handleAsrResult(text, isFinal) {
    console.log('ASR:', text, isFinal ? '(final)' : '(interim)');

    if (text) {
        currentAsrText = text;
        originalText.textContent = text;

        // Add pulse effect for interim results
        if (!isFinal) {
            originalText.classList.add('interim');
        } else {
            originalText.classList.remove('interim');
        }
    }
}

function handleTranslationResult(text, isFinal) {
    console.log('Translation:', text, isFinal ? '(final)' : '(interim)');

    if (text) {
        currentTranslationText = text;
        translatedText.textContent = text;

        if (!isFinal) {
            translatedText.classList.add('interim');
        } else {
            translatedText.classList.remove('interim');
        }
    }
}

function handleTurnComplete() {
    // Save to history if we have content
    if (currentAsrText || currentTranslationText) {
        addSubtitleItem(currentAsrText, currentTranslationText);
    }

    // Reset for next turn
    currentAsrText = '';
    currentTranslationText = '';
    originalText.textContent = '-';
    translatedText.textContent = '-';
    originalText.classList.remove('interim');
    translatedText.classList.remove('interim');
}

function addSubtitleItem(original, translation) {
    const item = document.createElement('div');
    item.className = 'subtitle-item';

    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const sourceLabel = getLanguageLabel(sourceLanguage.value);
    const targetLabel = getLanguageLabel(targetLanguage.value);

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

function getLanguageLabel(code) {
    const labels = {
        'zh': '中文',
        'en': 'EN',
        'ja': '日本語',
        'ko': '한국어'
    };
    return labels[code] || code.toUpperCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Audio Playback =====
async function handleAudioResponse(data) {
    const audioData = base64ToArrayBuffer(data.data);
    audioQueue.push({
        data: audioData,
        sampleRate: data.sampleRate || 24000
    });

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
    const audioItem = audioQueue.shift();

    try {
        const playbackContext = new AudioContext({ sampleRate: audioItem.sampleRate });

        // Convert Int16 PCM to Float32
        const int16Array = new Int16Array(audioItem.data);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        const audioBuffer = playbackContext.createBuffer(1, float32Array.length, audioItem.sampleRate);
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
    originalText.textContent = '-';
    translatedText.textContent = '-';
    currentAsrText = '';
    currentTranslationText = '';
    emptyState.classList.remove('hidden');
}

// ===== Event Listeners =====
startBtn.addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        const checkConnection = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                clearInterval(checkConnection);
                setTimeout(startRecording, 500);
            }
        }, 100);
    } else {
        startRecording();
    }
});

stopBtn.addEventListener('click', stopRecording);
clearBtn.addEventListener('click', clearHistory);

// Microphone selection events
micSelect.addEventListener('change', handleMicrophoneChange);
refreshMicBtn.addEventListener('click', getMicrophoneDevices);

// Language swap
swapLangBtn.addEventListener('click', swapLanguages);

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    updateStatus('disconnected', '等待连接');
    getMicrophoneDevices();
});
