import { useCallback, useRef, useState } from 'react';
import { base64ToArrayBuffer } from '../utils/audio';

interface UseAudioPlayerReturn {
    isPlaying: boolean;
    /** Add audio chunk to buffer (does not play immediately) */
    queueAudio: (base64Data: string) => void;
    /** Play all queued audio chunks */
    playQueuedAudio: () => Promise<void>;
    /** Clear all queued audio and stop playback */
    stopPlayback: () => void;
    /** Check if there's audio in the queue */
    hasQueuedAudio: () => boolean;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioChunksRef = useRef<ArrayBuffer[]>([]);

    const queueAudio = useCallback((base64Data: string) => {
        const audioData = base64ToArrayBuffer(base64Data);
        audioChunksRef.current.push(audioData);
    }, []);

    const playQueuedAudio = useCallback(async () => {
        if (audioChunksRef.current.length === 0 || isPlaying) return;

        setIsPlaying(true);

        // Combine all chunks into one buffer
        const totalLength = audioChunksRef.current.reduce(
            (sum, chunk) => sum + chunk.byteLength,
            0
        );
        const combinedBuffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of audioChunksRef.current) {
            combinedBuffer.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }
        audioChunksRef.current = [];

        try {
            const blob = new Blob([combinedBuffer], { type: 'audio/ogg' });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);

            return new Promise<void>((resolve) => {
                audio.onended = () => {
                    URL.revokeObjectURL(url);
                    setIsPlaying(false);
                    resolve();
                };

                audio.onerror = () => {
                    URL.revokeObjectURL(url);
                    setIsPlaying(false);
                    resolve();
                };

                audio.play().catch((error) => {
                    console.error('Error playing audio:', error);
                    setIsPlaying(false);
                    resolve();
                });
            });
        } catch (error) {
            console.error('Error playing audio:', error);
            setIsPlaying(false);
        }
    }, [isPlaying]);

    const stopPlayback = useCallback(() => {
        audioChunksRef.current = [];
        setIsPlaying(false);
    }, []);

    const hasQueuedAudio = useCallback(() => {
        return audioChunksRef.current.length > 0;
    }, []);

    return { isPlaying, queueAudio, playQueuedAudio, stopPlayback, hasQueuedAudio };
}
