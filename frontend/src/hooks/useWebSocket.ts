import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionStatus, SubtitleItem } from '../types';
import { generateId } from '../utils/audio';
import { useAudioPlayer } from './useAudioPlayer';

interface UseWebSocketProps {
    sourceLanguage: string;
    targetLanguage: string;
}

interface UseWebSocketReturn {
    status: ConnectionStatus;
    currentAsr: { text: string; isFinal: boolean };
    currentTranslation: { text: string; isFinal: boolean };
    subtitles: SubtitleItem[];
    connect: () => void;
    disconnect: () => void;
    sendAudio: (base64Data: string) => void;
    sendStop: () => void;
    clearSubtitles: () => void;
}

export function useWebSocket({
    sourceLanguage,
    targetLanguage,
}: UseWebSocketProps): UseWebSocketReturn {
    const [status, setStatus] = useState<ConnectionStatus>('disconnected');
    const [currentAsr, setCurrentAsr] = useState({ text: '', isFinal: false });
    const [currentTranslation, setCurrentTranslation] = useState({
        text: '',
        isFinal: false,
    });
    const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);

    const wsRef = useRef<WebSocket | null>(null);
    const currentAsrRef = useRef('');
    const currentTranslationRef = useRef('');
    const languagesRef = useRef({ source: sourceLanguage, target: targetLanguage });

    const { playAudio, stopPlayback } = useAudioPlayer();

    // Update language refs
    useEffect(() => {
        languagesRef.current = { source: sourceLanguage, target: targetLanguage };
    }, [sourceLanguage, targetLanguage]);

    const handleTurnComplete = useCallback(() => {
        if (currentAsrRef.current || currentTranslationRef.current) {
            const newSubtitle: SubtitleItem = {
                id: generateId(),
                timestamp: new Date(),
                sourceText: currentAsrRef.current,
                targetText: currentTranslationRef.current,
                sourceLanguage: languagesRef.current.source,
                targetLanguage: languagesRef.current.target,
            };
            setSubtitles((prev) => [...prev, newSubtitle]);
        }

        // Reset current texts
        currentAsrRef.current = '';
        currentTranslationRef.current = '';
        setCurrentAsr({ text: '', isFinal: false });
        setCurrentTranslation({ text: '', isFinal: false });
    }, []);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        setStatus('connecting');

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('WebSocket connected');

            // Send start message
            ws.send(
                JSON.stringify({
                    type: 'start',
                    sourceLanguage: languagesRef.current.source,
                    targetLanguage: languagesRef.current.target,
                })
            );
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'status':
                    if (data.status === 'ready') {
                        setStatus('connected');
                    } else if (data.status === 'disconnected') {
                        setStatus('disconnected');
                    }
                    break;

                case 'asr':
                    currentAsrRef.current = data.text || '';
                    setCurrentAsr({
                        text: data.text || '',
                        isFinal: data.isFinal,
                    });
                    break;

                case 'translation':
                    currentTranslationRef.current = data.text || '';
                    setCurrentTranslation({
                        text: data.text || '',
                        isFinal: data.isFinal,
                    });
                    break;

                case 'audio':
                    playAudio(data.data);
                    break;

                case 'turnComplete':
                    handleTurnComplete();
                    break;

                case 'error':
                    console.error('Server error:', data.message);
                    setStatus('error');
                    break;
            }
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            setStatus('disconnected');
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            setStatus('error');
        };
    }, [handleTurnComplete, playAudio]);

    const disconnect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        stopPlayback();
        setStatus('disconnected');
    }, [stopPlayback]);

    const sendAudio = useCallback((base64Data: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
                JSON.stringify({
                    type: 'audio',
                    data: base64Data,
                })
            );
        }
    }, []);

    const sendStop = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'stop' }));
        }
    }, []);

    const clearSubtitles = useCallback(() => {
        setSubtitles([]);
        currentAsrRef.current = '';
        currentTranslationRef.current = '';
        setCurrentAsr({ text: '', isFinal: false });
        setCurrentTranslation({ text: '', isFinal: false });
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return {
        status,
        currentAsr,
        currentTranslation,
        subtitles,
        connect,
        disconnect,
        sendAudio,
        sendStop,
        clearSubtitles,
    };
}
