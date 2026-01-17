import { useCallback, useRef, useState } from 'react';
import { base64ToArrayBuffer } from '../utils/audio';

interface UseAudioPlayerReturn {
    isPlaying: boolean;
    playAudio: (base64Data: string) => void;
    stopPlayback: () => void;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioChunksRef = useRef<ArrayBuffer[]>([]);
    const timeoutRef = useRef<number | null>(null);

    const playCollectedAudio = useCallback(async () => {
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

            audio.onended = () => {
                URL.revokeObjectURL(url);
                setIsPlaying(false);
            };

            audio.onerror = () => {
                URL.revokeObjectURL(url);
                setIsPlaying(false);
            };

            await audio.play();
        } catch (error) {
            console.error('Error playing audio:', error);
            setIsPlaying(false);
        }
    }, [isPlaying]);

    const playAudio = useCallback(
        (base64Data: string) => {
            const audioData = base64ToArrayBuffer(base64Data);
            audioChunksRef.current.push(audioData);

            // Clear previous timeout
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            // Play after a short delay to collect chunks
            timeoutRef.current = window.setTimeout(() => {
                if (audioChunksRef.current.length > 0 && !isPlaying) {
                    playCollectedAudio();
                }
            }, 300);
        },
        [isPlaying, playCollectedAudio]
    );

    const stopPlayback = useCallback(() => {
        audioChunksRef.current = [];
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setIsPlaying(false);
    }, []);

    return { isPlaying, playAudio, stopPlayback };
}
