import { useRef, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { motion } from 'framer-motion';
import './VolumeVisualizer.css';

interface VolumeVisualizerProps {
    isActive: boolean;
    volume: number;
    frequencyData: Uint8Array | null;
}

export function VolumeVisualizer({
    isActive,
    volume,
    frequencyData,
}: VolumeVisualizerProps) {
    const barsRef = useRef<(HTMLDivElement | null)[]>([]);
    const circumference = 283; // 2 * PI * 45

    useEffect(() => {
        if (!frequencyData || !isActive) return;

        const barCount = 8;
        const step = Math.floor(frequencyData.length / barCount);

        for (let i = 0; i < barCount; i++) {
            const bar = barsRef.current[i];
            if (bar) {
                const value = frequencyData[i * step] || 0;
                const height = Math.max(4, (value / 255) * 36);
                bar.style.height = `${height}px`;
            }
        }
    }, [frequencyData, isActive]);

    const getVolumeLabel = () => {
        if (volume > 0.75) return '响亮';
        if (volume > 0.4) return '正常';
        if (volume > 0.15) return '轻声';
        return '静音';
    };

    const offset = circumference - volume * circumference;

    return (
        <motion.div
            className={`volume-visualizer ${isActive ? 'active' : ''} ${volume > 0.75 ? 'loud' : ''}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
                opacity: isActive ? 1 : 0,
                scale: isActive ? 1 : 0.8,
            }}
            transition={{ duration: 0.3 }}
        >
            <div className="volume-ring">
                <svg viewBox="0 0 100 100" className="volume-svg">
                    <circle className="volume-bg" cx="50" cy="50" r="45" />
                    <circle
                        className="volume-level"
                        cx="50"
                        cy="50"
                        r="45"
                        style={{ strokeDashoffset: offset }}
                    />
                </svg>
                <div className="volume-icon">
                    <Mic size={24} />
                </div>
            </div>

            <div className="volume-bars">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div
                        key={i}
                        className="vol-bar"
                        ref={(el) => { barsRef.current[i] = el; }}
                    />
                ))}
            </div>

            <span className="volume-label">{getVolumeLabel()}</span>
        </motion.div>
    );
}
