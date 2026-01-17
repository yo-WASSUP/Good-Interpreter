import { MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SubtitleItem } from '../../types';
import { getLanguageLabel } from '../../constants/languages';
import { formatTime } from '../../utils/audio';
import './SubtitleDisplay.css';

interface SubtitleDisplayProps {
    subtitles: SubtitleItem[];
    isEmpty: boolean;
}

export function SubtitleDisplay({ subtitles, isEmpty }: SubtitleDisplayProps) {
    return (
        <section className="subtitle-section">
            <div className="subtitle-container">
                <AnimatePresence>
                    {isEmpty && subtitles.length === 0 && (
                        <motion.div
                            className="empty-state"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="empty-icon">
                                <MessageSquare size={40} />
                            </div>
                            <p className="empty-title">准备开始翻译</p>
                            <p className="empty-subtitle">
                                点击下方按钮开始实时翻译会议内容
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="subtitles-wrapper">
                    <AnimatePresence>
                        {subtitles.map((item) => (
                            <motion.div
                                key={item.id}
                                className="subtitle-item"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="subtitle-header">
                                    <span className="subtitle-time">
                                        {formatTime(item.timestamp)}
                                    </span>
                                </div>
                                <div className="subtitle-bilingual">
                                    <div className="subtitle-source">
                                        <span className="lang-tag source-tag">
                                            {getLanguageLabel(item.sourceLanguage)}
                                        </span>
                                        <p className="subtitle-text source-text">
                                            {item.sourceText || '-'}
                                        </p>
                                    </div>
                                    <div className="subtitle-arrow">→</div>
                                    <div className="subtitle-target">
                                        <span className="lang-tag target-tag">
                                            {getLanguageLabel(item.targetLanguage)}
                                        </span>
                                        <p className="subtitle-text target-text">
                                            {item.targetText || '-'}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </section>
    );
}
