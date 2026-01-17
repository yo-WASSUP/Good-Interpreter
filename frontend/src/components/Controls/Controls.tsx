import { Mic, Square, Trash2, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MicrophoneDevice } from '../../types';
import { VolumeVisualizer } from '../VolumeVisualizer';
import './Controls.css';

interface ControlsProps {
    isRecording: boolean;
    microphones: MicrophoneDevice[];
    selectedMicrophoneId: string | null;
    volume: number;
    frequencyData: Uint8Array | null;
    onStart: () => void;
    onStop: () => void;
    onClear: () => void;
    onMicrophoneChange: (deviceId: string) => void;
    onRefreshMicrophones: () => void;
}

export function Controls({
    isRecording,
    microphones,
    selectedMicrophoneId,
    volume,
    frequencyData,
    onStart,
    onStop,
    onClear,
    onMicrophoneChange,
    onRefreshMicrophones,
}: ControlsProps) {
    return (
        <footer className="controls">
            {/* Microphone Selection */}
            <div className="mic-selector-wrapper">
                <div className="mic-selector">
                    <span className="mic-selector-icon">
                        <Mic size={18} />
                    </span>
                    <select
                        className="mic-select"
                        value={selectedMicrophoneId || ''}
                        onChange={(e) => onMicrophoneChange(e.target.value)}
                        disabled={isRecording}
                    >
                        {microphones.length === 0 ? (
                            <option value="">请选择麦克风</option>
                        ) : (
                            microphones.map((mic) => (
                                <option key={mic.deviceId} value={mic.deviceId}>
                                    {mic.label || `麦克风 ${mic.deviceId.slice(0, 8)}`}
                                </option>
                            ))
                        )}
                    </select>
                </div>
                <motion.button
                    className="mic-refresh-btn"
                    onClick={onRefreshMicrophones}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    title="刷新麦克风列表"
                >
                    <RefreshCw size={18} />
                </motion.button>
            </div>

            {/* Translation Mode Display */}
            <div className="translation-mode">
                <span className="mode-badge">
                    🇨🇳 中文 → 🇺🇸 English
                </span>
            </div>

            {/* Volume Visualizer */}
            {isRecording && (
                <VolumeVisualizer volume={volume} frequencyData={frequencyData} isActive={true} />
            )}

            {/* Action Buttons */}
            <div className="action-buttons">
                {!isRecording ? (
                    <motion.button
                        className="btn btn-primary btn-start"
                        onClick={onStart}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        <Mic size={20} />
                        <span>开始翻译</span>
                    </motion.button>
                ) : (
                    <motion.button
                        className="btn btn-danger btn-stop"
                        onClick={onStop}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        <Square size={20} />
                        <span>停止翻译</span>
                    </motion.button>
                )}

                <motion.button
                    className="btn btn-secondary btn-clear"
                    onClick={onClear}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="清空记录"
                >
                    <Trash2 size={18} />
                </motion.button>
            </div>
        </footer>
    );
}
