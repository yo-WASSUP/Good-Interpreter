import { Mic, Square, Trash2, RefreshCw, ArrowUpDown } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MicrophoneDevice } from '../../types';
import { LANGUAGES } from '../../constants/languages';
import { VolumeVisualizer } from '../VolumeVisualizer';
import './Controls.css';

interface ControlsProps {
    isRecording: boolean;
    microphones: MicrophoneDevice[];
    selectedMicrophoneId: string | null;
    sourceLanguage: string;
    targetLanguage: string;
    volume: number;
    frequencyData: Uint8Array | null;
    onStart: () => void;
    onStop: () => void;
    onClear: () => void;
    onMicrophoneChange: (deviceId: string) => void;
    onRefreshMicrophones: () => void;
    onSourceLanguageChange: (lang: string) => void;
    onTargetLanguageChange: (lang: string) => void;
    onSwapLanguages: () => void;
}

export function Controls({
    isRecording,
    microphones,
    selectedMicrophoneId,
    sourceLanguage,
    targetLanguage,
    volume,
    frequencyData,
    onStart,
    onStop,
    onClear,
    onMicrophoneChange,
    onRefreshMicrophones,
    onSourceLanguageChange,
    onTargetLanguageChange,
    onSwapLanguages,
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
                        <option value="">选择麦克风...</option>
                        {microphones.map((mic) => (
                            <option key={mic.deviceId} value={mic.deviceId}>
                                {mic.label}
                            </option>
                        ))}
                    </select>
                </div>
                <motion.button
                    className="btn btn-ghost btn-sm"
                    onClick={onRefreshMicrophones}
                    disabled={isRecording}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="刷新麦克风列表"
                >
                    <RefreshCw size={18} />
                </motion.button>
            </div>

            {/* Language Selection */}
            <div className="lang-selector-wrapper">
                <div className="lang-selector">
                    <span className="lang-selector-label">源语言</span>
                    <select
                        className="lang-select"
                        value={sourceLanguage}
                        onChange={(e) => onSourceLanguageChange(e.target.value)}
                        disabled={isRecording}
                    >
                        {LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                                {lang.label}
                            </option>
                        ))}
                    </select>
                </div>
                <motion.button
                    className="lang-swap-btn"
                    onClick={onSwapLanguages}
                    disabled={isRecording}
                    whileHover={{ scale: 1.1, rotate: 180 }}
                    whileTap={{ scale: 0.9 }}
                    title="交换语言"
                >
                    <ArrowUpDown size={18} />
                </motion.button>
                <div className="lang-selector">
                    <span className="lang-selector-label">目标语言</span>
                    <select
                        className="lang-select"
                        value={targetLanguage}
                        onChange={(e) => onTargetLanguageChange(e.target.value)}
                        disabled={isRecording}
                    >
                        {LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                                {lang.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Control Buttons */}
            <div className="control-group">
                <motion.button
                    className="btn btn-primary"
                    onClick={onStart}
                    disabled={isRecording}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                >
                    <span className="btn-icon">
                        <Mic size={20} />
                    </span>
                    <span className="btn-text">开始翻译</span>
                </motion.button>

                <motion.button
                    className="btn btn-secondary"
                    onClick={onStop}
                    disabled={!isRecording}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    <span className="btn-icon">
                        <Square size={20} />
                    </span>
                    <span className="btn-text">停止翻译</span>
                </motion.button>

                <motion.button
                    className="btn btn-ghost"
                    onClick={onClear}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    <span className="btn-icon">
                        <Trash2 size={20} />
                    </span>
                    <span className="btn-text">清除记录</span>
                </motion.button>
            </div>

            {/* Volume Visualizer */}
            <VolumeVisualizer
                isActive={isRecording}
                volume={volume}
                frequencyData={frequencyData}
            />
        </footer>
    );
}
