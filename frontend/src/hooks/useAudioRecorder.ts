import { useCallback, useEffect, useRef, useState } from 'react';
import type { MicrophoneDevice } from '../types';
import { arrayBufferToBase64, convertFloat32ToInt16 } from '../utils/audio';

interface UseAudioRecorderProps {
    onAudioData: (base64Data: string) => void;
    onVolumeChange?: (volume: number, frequencyData: Uint8Array) => void;
}

interface UseAudioRecorderReturn {
    isRecording: boolean;
    microphones: MicrophoneDevice[];
    selectedMicrophoneId: string | null;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    selectMicrophone: (deviceId: string) => void;
    refreshMicrophones: () => Promise<void>;
}

export function useAudioRecorder({
    onAudioData,
    onVolumeChange,
}: UseAudioRecorderProps): UseAudioRecorderReturn {
    const [isRecording, setIsRecording] = useState(false);
    const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
    const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const initializedRef = useRef(false);
    const isRecordingRef = useRef(false);

    const refreshMicrophones = useCallback(async () => {
        try {
            // Request permission first
            await navigator.mediaDevices.getUserMedia({ audio: true });

            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices
                .filter((device) => device.kind === 'audioinput')
                .map((device, index) => ({
                    deviceId: device.deviceId,
                    label: device.label || `麦克风 ${index + 1}`,
                }));

            setMicrophones(audioInputs);

            // Set default microphone
            if (audioInputs.length > 0 && !selectedMicrophoneId) {
                const defaultDevice =
                    audioInputs.find((d) => d.deviceId === 'default') || audioInputs[0];
                setSelectedMicrophoneId(defaultDevice.deviceId);
            }
        } catch (error) {
            console.error('Error getting microphone devices:', error);
        }
    }, [selectedMicrophoneId]);

    const selectMicrophone = useCallback((deviceId: string) => {
        setSelectedMicrophoneId(deviceId);
    }, []);

    const startRecording = useCallback(async () => {
        try {
            const audioConstraints: MediaTrackConstraints = {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
            };

            if (selectedMicrophoneId) {
                audioConstraints.deviceId = { exact: selectedMicrophoneId };
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: audioConstraints,
            });
            streamRef.current = stream;

            const audioContext = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);

            // Create analyser for volume visualization
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;
            source.connect(analyser);

            processor.onaudioprocess = (e) => {
                // Use ref to get current recording state (avoids stale closure)
                if (!isRecordingRef.current) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const pcmData = convertFloat32ToInt16(inputData);
                const base64Data = arrayBufferToBase64(pcmData.buffer as ArrayBuffer);

                onAudioData(base64Data);
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            isRecordingRef.current = true;
            setIsRecording(true);

            // Start volume visualization
            if (onVolumeChange) {
                const updateVolume = () => {
                    if (!analyserRef.current) return;

                    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                    analyserRef.current.getByteFrequencyData(dataArray);

                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        sum += dataArray[i];
                    }
                    const average = sum / dataArray.length;
                    // Use higher divisor (180) to make volume thresholds more accurate
                    const normalizedVolume = Math.min(average / 180, 1);

                    onVolumeChange(normalizedVolume, dataArray);

                    animationFrameRef.current = requestAnimationFrame(updateVolume);
                };
                updateVolume();
            }
        } catch (error) {
            console.error('Error starting recording:', error);
            throw error;
        }
    }, [selectedMicrophoneId, onAudioData, onVolumeChange, isRecording]);

    const stopRecording = useCallback(() => {
        isRecordingRef.current = false;
        setIsRecording(false);

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
            analyserRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    }, []);

    // Initialize microphones on mount
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        // Use async IIFE to avoid returning a promise
        (async () => {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices
                    .filter((device) => device.kind === 'audioinput')
                    .map((device, index) => ({
                        deviceId: device.deviceId,
                        label: device.label || `麦克风 ${index + 1}`,
                    }));
                setMicrophones(audioInputs);
                if (audioInputs.length > 0) {
                    const defaultDevice = audioInputs.find((d) => d.deviceId === 'default') || audioInputs[0];
                    setSelectedMicrophoneId(defaultDevice.deviceId);
                }
            } catch (error) {
                console.error('Error getting microphone devices:', error);
            }
        })();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRecording();
        };
    }, [stopRecording]);

    return {
        isRecording,
        microphones,
        selectedMicrophoneId,
        startRecording,
        stopRecording,
        selectMicrophone,
        refreshMicrophones,
    };
}
