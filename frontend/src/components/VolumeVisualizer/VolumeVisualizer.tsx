import { useRef, useEffect } from 'react';
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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;
        const centerY = height / 2;

        const draw = () => {
            ctx.clearRect(0, 0, width, height);

            // Create gradient
            const gradient = ctx.createLinearGradient(0, 0, width, 0);
            gradient.addColorStop(0, '#6366f1');
            gradient.addColorStop(0.5, '#8b5cf6');
            gradient.addColorStop(1, '#ec4899');

            if (!isActive || !frequencyData || frequencyData.length === 0) {
                // Idle line
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
                ctx.lineWidth = 2;
                ctx.moveTo(0, centerY);
                ctx.lineTo(width, centerY);
                ctx.stroke();
            } else {
                // Draw bars instead of waveform for better visibility
                const barCount = 10;
                const barWidth = 4;
                const gap = 4;
                const totalWidth = barCount * (barWidth + gap) - gap;
                const startX = (width - totalWidth) / 2;

                for (let i = 0; i < barCount; i++) {
                    const dataIndex = Math.floor((i / barCount) * frequencyData.length);
                    const value = frequencyData[dataIndex] || 0;

                    // Scale the height with volume boost
                    const barHeight = Math.max(4, (value / 255) * (height * 0.8) * (1 + volume * 0.5));
                    const x = startX + i * (barWidth + gap);
                    const y = centerY - barHeight / 2;

                    // Draw bar with rounded corners
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.roundRect(x, y, barWidth, barHeight, 2);
                    ctx.fill();

                    // Add glow
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';
                }
                ctx.shadowBlur = 0;
            }

            animationRef.current = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            cancelAnimationFrame(animationRef.current);
        };
    }, [isActive, frequencyData, volume]);

    return (
        <motion.div
            className={`volume-visualizer ${isActive ? 'active' : ''}`}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <canvas ref={canvasRef} className="waveform-canvas" />
        </motion.div>
    );
}
