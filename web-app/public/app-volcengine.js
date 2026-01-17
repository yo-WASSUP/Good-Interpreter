// ===== DOM Elements =====
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const statusBadge = document.getElementById('statusBadge');
const emptyState = document.getElementById('emptyState');
const subtitlesWrapper = document.getElementById('subtitlesWrapper');
const originalText = document.getElementById('originalText');
const translatedText = document.getElementById('translatedText');
const micSelect = document.getElementById('micSelect');
const refreshMicBtn = document.getElementById('refreshMicBtn');
const sourceLanguage = document.getElementById('sourceLanguage');
const targetLanguage = document.getElementById('targetLanguage');
const swapLangBtn = document.getElementById('swapLangBtn');

// Volume visualizer elements
const volumeVisualizer = document.getElementById('volumeVisualizer');
const volumeLevel = document.getElementById('volumeLevel');
const volumeLabel = document.getElementById('volumeLabel');
const volumeBars = [];
for (let i = 0; i < 8; i++) {
    volumeBars.push(document.getElementById(`volBar${i}`));
}

// ===== State =====
let ws = null;
let audioContext = null;
let analyserNode = null;
let isRecording = false;
let audioQueue = [];
let isPlaying = false;
let selectedDeviceId = null;
let currentAsrText = '';
let currentTranslationText = '';
let volumeAnimationId = null;

// ===== WebSocket Connection =====
function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Support both Node.js (/) and Python (/ws) backends
    ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);

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

        // Create analyser for volume visualization
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 256;
        source.connect(analyserNode);

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
        volumeVisualizer.classList.add('active');
        updateStatus('recording', '正在录音...');
        emptyState.classList.add('hidden');

        // Start volume visualization
        startVolumeVisualization();

    } catch (error) {
        console.error('Error starting recording:', error);
        alert('无法访问麦克风，请检查权限设置');
    }
}

function stopRecording() {
    isRecording = false;

    // Stop volume visualization
    stopVolumeVisualization();

    // Send stop signal to server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
        analyserNode = null;
    }

    startBtn.disabled = false;
    stopBtn.disabled = true;
    volumeVisualizer.classList.remove('active');
    volumeVisualizer.classList.remove('loud');

    if (ws && ws.readyState === WebSocket.OPEN) {
        updateStatus('connected', '已连接');
    } else {
        updateStatus('disconnected', '已断开');
    }
}

// ===== Volume Visualization =====
function startVolumeVisualization() {
    if (!analyserNode) return;

    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

    function updateVolume() {
        if (!isRecording || !analyserNode) return;

        analyserNode.getByteFrequencyData(dataArray);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalizedVolume = Math.min(average / 128, 1); // 0 to 1

        // Update circular progress
        const circumference = 283; // 2 * PI * 45
        const offset = circumference - (normalizedVolume * circumference);
        volumeLevel.style.strokeDashoffset = offset;

        // Update volume bars with frequency data
        const barCount = volumeBars.length;
        const step = Math.floor(dataArray.length / barCount);
        for (let i = 0; i < barCount; i++) {
            const value = dataArray[i * step];
            const height = Math.max(4, (value / 255) * 36);
            volumeBars[i].style.height = `${height}px`;
        }

        // Update label and loud state
        if (normalizedVolume > 0.6) {
            volumeVisualizer.classList.add('loud');
            volumeLabel.textContent = '响亮';
        } else if (normalizedVolume > 0.3) {
            volumeVisualizer.classList.remove('loud');
            volumeLabel.textContent = '正常';
        } else if (normalizedVolume > 0.05) {
            volumeVisualizer.classList.remove('loud');
            volumeLabel.textContent = '轻声';
        } else {
            volumeVisualizer.classList.remove('loud');
            volumeLabel.textContent = '静音';
        }

        volumeAnimationId = requestAnimationFrame(updateVolume);
    }

    updateVolume();
}

function stopVolumeVisualization() {
    if (volumeAnimationId) {
        cancelAnimationFrame(volumeAnimationId);
        volumeAnimationId = null;
    }

    // Reset visuals
    volumeLevel.style.strokeDashoffset = 283;
    volumeBars.forEach(bar => {
        bar.style.height = '4px';
    });
    volumeLabel.textContent = '静音';
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
// Collect audio chunks and play them together
let audioChunks = [];
let audioPlaybackContext = null;

async function handleAudioResponse(data) {
    // Collect opus audio chunks
    const audioData = base64ToArrayBuffer(data.data);
    audioChunks.push(audioData);

    // Don't play immediately - wait for TTSSentenceEnd to play all at once
    // Or set a timeout to play if no more data comes
    clearTimeout(window.audioPlayTimeout);
    window.audioPlayTimeout = setTimeout(() => {
        if (audioChunks.length > 0 && !isPlaying) {
            playCollectedAudio();
        }
    }, 300);
}

// Called when TTSSentenceEnd is received or timeout
async function playCollectedAudio() {
    if (audioChunks.length === 0 || isPlaying) return;

    isPlaying = true;

    // Combine all chunks into one buffer
    const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combinedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) {
        combinedBuffer.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
    }
    audioChunks = [];

    try {
        // Create audio blob and play with HTML5 Audio
        // This is more reliable for opus/ogg format than Web Audio API
        const blob = new Blob([combinedBuffer], { type: 'audio/ogg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        audio.onended = () => {
            URL.revokeObjectURL(url);
            isPlaying = false;
        };

        audio.onerror = (e) => {
            console.error('Audio playback error:', e);
            URL.revokeObjectURL(url);
            isPlaying = false;

            // Fallback: try decodeAudioData
            tryDecodeAudioData(combinedBuffer.buffer);
        };

        await audio.play();
    } catch (error) {
        console.error('Error playing audio:', error);
        isPlaying = false;
    }
}

// Fallback method using Web Audio API decodeAudioData
async function tryDecodeAudioData(arrayBuffer) {
    try {
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        source.onended = () => {
            audioContext.close();
            isPlaying = false;
        };

        source.start();
    } catch (error) {
        console.error('Fallback decode failed:', error);
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
