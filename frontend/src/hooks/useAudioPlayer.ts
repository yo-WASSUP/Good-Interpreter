import { useCallback, useRef, useState } from 'react';
import { base64ToArrayBuffer } from '../utils/audio';

interface UseAudioPlayerReturn {
    isPlaying: boolean;
    isMuted: boolean;
    /** Add audio chunk to buffer (does not play immediately) */
    queueAudio: (base64Data: string) => void;
    /** Play all queued audio chunks */
    playQueuedAudio: () => Promise<void>;
    /** Clear all queued audio and stop playback */
    stopPlayback: () => void;
    /** Check if there's audio in the queue */
    hasQueuedAudio: () => boolean;
    /** Toggle mute state */
    toggleMute: () => void;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const audioChunksRef = useRef<ArrayBuffer[]>([]);
    const isMutedRef = useRef(false);
    const playbackQueueRef = useRef<ArrayBuffer[][]>([]);
    const isProcessingRef = useRef(false);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => {
            isMutedRef.current = !prev;
            return !prev;
        });
    }, []);

    const queueAudio = useCallback((base64Data: string) => {
        const audioData = base64ToArrayBuffer(base64Data);
        audioChunksRef.current.push(audioData);
    }, []);

    // Play a single audio buffer and return a promise
    const playSingleAudio = useCallback((chunks: ArrayBuffer[]): Promise<void> => {
        return new Promise((resolve) => {
            if (chunks.length === 0) {
                resolve();
                return;
            }

            // Combine all chunks into one buffer
            const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
            const combinedBuffer = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                combinedBuffer.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
            }

            try {
                const blob = new Blob([combinedBuffer], { type: 'audio/ogg' });
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);

                audio.onended = () => {
                    URL.revokeObjectURL(url);
                    resolve();
                };

                audio.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve();
                };

                audio.play().catch((error) => {
                    console.error('Error playing audio:', error);
                    resolve();
                });
            } catch (error) {
                console.error('Error playing audio:', error);
                resolve();
            }
        });
    }, []);

    // Process the playback queue sequentially
    const processQueue = useCallback(async () => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;
        setIsPlaying(true);

        while (playbackQueueRef.current.length > 0) {
            const chunks = playbackQueueRef.current.shift();
            if (chunks && chunks.length > 0) {
                await playSingleAudio(chunks);
            }
        }

        setIsPlaying(false);
        isProcessingRef.current = false;
    }, [playSingleAudio]);

    const playQueuedAudio = useCallback(async () => {
        if (audioChunksRef.current.length === 0) return;

        // If muted, just clear the queue and return
        if (isMutedRef.current) {
            audioChunksRef.current = [];
            return;
        }

        // Move current chunks to playback queue
        const chunksToPlay = [...audioChunksRef.current];
        audioChunksRef.current = [];
        playbackQueueRef.current.push(chunksToPlay);

        // Start processing if not already
        processQueue();
    }, [processQueue]);

    const stopPlayback = useCallback(() => {
        audioChunksRef.current = [];
        playbackQueueRef.current = [];
        isProcessingRef.current = false;
        setIsPlaying(false);
    }, []);

    const hasQueuedAudio = useCallback(() => {
        return audioChunksRef.current.length > 0;
    }, []);

    return { isPlaying, isMuted, queueAudio, playQueuedAudio, stopPlayback, hasQueuedAudio, toggleMute };
}
