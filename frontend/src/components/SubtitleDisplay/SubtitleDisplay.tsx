import { useRef, useEffect, useState } from 'react';
import { MessageSquare, Download, Sparkles, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import type { SubtitleItem } from '../../types';
import { formatTime } from '../../utils/audio';
import { summarizeMeeting } from '../../services/api';
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
    const [showSummary, setShowSummary] = useState(false);
    const [summary, setSummary] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Auto-scroll to bottom when new subtitles are added
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [subtitles, currentSourceText, currentTargetText]);

    // Export meeting records as text file
    const handleExport = () => {
        if (subtitles.length === 0) return;

        const date = new Date().toLocaleDateString('zh-CN');
        const time = new Date().toLocaleTimeString('zh-CN');

        let content = `会议记录\n日期: ${date} ${time}\n${'='.repeat(50)}\n\n`;

        subtitles.forEach((item, index) => {
            content += `[${index + 1}] ${formatTime(item.timestamp)}\n`;
            content += `原文: ${item.sourceText || '-'}\n`;
            content += `译文: ${item.targetText || '-'}\n\n`;
        });

        content += `${'='.repeat(50)}\n共 ${subtitles.length} 条记录\n`;

        // Create and download file
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `会议记录_${date.replace(/\//g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Generate meeting summary
    const handleSummarize = async () => {
        if (subtitles.length === 0) return;

        setIsLoading(true);
        setShowSummary(true);
        setSummary('');

        try {
            const messages = subtitles.map((item) => ({
                sourceText: item.sourceText,
                targetText: item.targetText,
            }));
            const result = await summarizeMeeting(messages);
            setSummary(result);
        } catch (error) {
            setSummary('⚠️ 总结生成失败，请稍后重试。');
        } finally {
            setIsLoading(false);
        }
    };

    const hasCurrentText = currentSourceText || currentTargetText;

    return (
        <section className="subtitle-section">
            <div className="subtitle-header-bar">
                <h2 className="subtitle-title">会议记录</h2>
                <div className="subtitle-header-actions">
                    <span className="subtitle-count">{subtitles.length} 条</span>
                    {subtitles.length > 0 && (
                        <>
                            <motion.button
                                className="summary-btn"
                                onClick={handleSummarize}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                title="AI 会议总结"
                            >
                                <Sparkles size={16} />
                            </motion.button>
                            <motion.button
                                className="export-btn"
                                onClick={handleExport}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                title="导出会议记录"
                            >
                                <Download size={16} />
                            </motion.button>
                        </>
                    )}
                </div>
            </div>

            {/* Summary Modal */}
            <AnimatePresence>
                {showSummary && (
                    <motion.div
                        className="summary-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowSummary(false)}
                    >
                        <motion.div
                            className="summary-modal"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="summary-header">
                                <h3>
                                    <Sparkles size={18} />
                                    AI 会议总结
                                </h3>
                                <div className="summary-header-actions">
                                    {!isLoading && summary && (
                                        <button
                                            className="summary-export-btn"
                                            onClick={() => {
                                                const blob = new Blob([summary], { type: 'text/markdown;charset=utf-8' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `会议总结_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.md`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            }}
                                            title="导出总结"
                                        >
                                            <Download size={16} />
                                        </button>
                                    )}
                                    <button
                                        className="summary-close"
                                        onClick={() => setShowSummary(false)}
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>
                            <div className="summary-content">
                                {isLoading ? (
                                    <div className="summary-loading">
                                        <Loader2 size={24} className="spin" />
                                        <span>正在生成总结...</span>
                                    </div>
                                ) : (
                                    <div className="summary-text markdown-body">
                                        <ReactMarkdown>{summary}</ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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
        </section>
    );
}
