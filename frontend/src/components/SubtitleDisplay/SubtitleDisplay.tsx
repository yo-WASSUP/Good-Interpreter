import { useRef, useEffect } from 'react';
import { MessageSquare, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SubtitleItem } from '../../types';
import { formatTime } from '../../utils/audio';
import './SubtitleDisplay.css';

interface SubtitleDisplayProps {
    subtitles: SubtitleItem[];
    isEmpty: boolean;
    currentSourceText?: string;
    currentTargetText?: string;
}

export function SubtitleDisplay({
    subtitles,
    isEmpty,
    currentSourceText = '',
    currentTargetText = '',
}: SubtitleDisplayProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new subtitles are added
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [subtitles, currentSourceText, currentTargetText]);

    const scrollToBottom = () => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const hasCurrentText = currentSourceText || currentTargetText;

    return (
        <section className="subtitle-section">
            <div className="subtitle-header-bar">
                <h2 className="subtitle-title">会议记录</h2>
                <span className="subtitle-count">{subtitles.length} 条</span>
            </div>

            <div className="subtitle-container" ref={containerRef}>
                <AnimatePresence>
                    {isEmpty && subtitles.length === 0 && !hasCurrentText && (
                        <motion.div
                            className="empty-state"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="empty-icon">
                                <MessageSquare size={32} />
                            </div>
                            <p className="empty-title">准备开始翻译</p>
                            <p className="empty-subtitle">
                                点击下方按钮开始实时翻译
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="subtitles-wrapper">
                    <AnimatePresence>
                        {subtitles.map((item, index) => (
                            <motion.div
                                key={item.id}
                                className="subtitle-item"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="subtitle-index">{index + 1}</div>
                                <div className="subtitle-content">
                                    <div className="subtitle-row source-row">
                                        <span className="lang-tag source-tag">
                                            原文
                                        </span>
                                        <p className="subtitle-text">
                                            {item.sourceText || '-'}
                                        </p>
                                    </div>
                                    <div className="subtitle-row target-row">
                                        <span className="lang-tag target-tag">
                                            译文
                                        </span>
                                        <p className="subtitle-text">
                                            {item.targetText || '-'}
                                        </p>
                                    </div>
                                </div>
                                <div className="subtitle-time">
                                    {formatTime(item.timestamp)}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {/* Current speaking indicator */}
                    {hasCurrentText && (
                        <motion.div
                            className="subtitle-item current-speaking"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            <div className="subtitle-index speaking-indicator">
                                <span className="speaking-dot" />
                            </div>
                            <div className="subtitle-content">
                                <div className="subtitle-row source-row">
                                    <span className="lang-tag source-tag">原文</span>
                                    <p className="subtitle-text interim">
                                        {currentSourceText || '正在听...'}
                                    </p>
                                </div>
                                {currentTargetText && (
                                    <div className="subtitle-row target-row">
                                        <span className="lang-tag target-tag">译文</span>
                                        <p className="subtitle-text interim">
                                            {currentTargetText}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* Scroll anchor */}
                    <div ref={bottomRef} />
                </div>
            </div>

            {/* Scroll to bottom button */}
            {subtitles.length > 3 && (
                <motion.button
                    className="scroll-to-bottom"
                    onClick={scrollToBottom}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                >
                    <ArrowDown size={16} />
                </motion.button>
            )}
        </section>
    );
}
