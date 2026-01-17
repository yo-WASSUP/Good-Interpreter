// WebSocket message types
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'recording' | 'error';

export interface Language {
    code: string;
    label: string;
    nativeLabel: string;
}

export interface SubtitleItem {
    id: string;
    timestamp: Date;
    sourceText: string;
    targetText: string;
    sourceLanguage: string;
    targetLanguage: string;
}

export interface MicrophoneDevice {
    deviceId: string;
    label: string;
}

// WebSocket message types
export interface WSMessage {
    type: string;
    [key: string]: unknown;
}

export interface WSStartMessage extends WSMessage {
    type: 'start';
    sourceLanguage: string;
    targetLanguage: string;
}

export interface WSAudioMessage extends WSMessage {
    type: 'audio';
    data: string;
}

export interface WSStatusMessage extends WSMessage {
    type: 'status';
    status: 'ready' | 'disconnected';
}

export interface WSAsrMessage extends WSMessage {
    type: 'asr';
    text: string;
    isFinal: boolean;
    sequence?: number;
}

export interface WSTranslationMessage extends WSMessage {
    type: 'translation';
    text: string;
    language: string;
    isFinal: boolean;
    sequence?: number;
}

export interface WSAudioResponseMessage extends WSMessage {
    type: 'audio';
    data: string;
    format: string;
    sampleRate: number;
}

export interface WSErrorMessage extends WSMessage {
    type: 'error';
    message: string;
}

export interface WSTurnCompleteMessage extends WSMessage {
    type: 'turnComplete';
}
