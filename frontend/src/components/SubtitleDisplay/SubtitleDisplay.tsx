import { useRef, useEffect, useState, useMemo } from 'react';
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
    currentSourceText: _currentSourceText = '',
    currentTargetText: _currentTargetText = '',
}: SubtitleDisplayProps) {
    const leftBottomRef = useRef<HTMLDivElement>(null);
    const rightBottomRef = useRef<HTMLDivElement>(null);
    const [showSummary, setShowSummary] = useState(false);
    const [summary, setSummary] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Split subtitles by direction
    const { zhToEn, enToZh } = useMemo(() => {
        const zhToEn: SubtitleItem[] = [];
        const enToZh: SubtitleItem[] = [];

        subtitles.forEach(item => {
            // Check source language to determine direction
            if (item.sourceLanguage === 'zh' || item.sourceLanguage === 'zh-CN') {
                zhToEn.push(item);
            } else {
                enToZh.push(item);
            }
        });

        return { zhToEn, enToZh };
    }, [subtitles]);

    // Auto-scroll both columns to bottom
    useEffect(() => {
        // Small delay to ensure DOM is updated
        setTimeout(() => {
            if (leftBottomRef.current) {
                leftBottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
            if (rightBottomRef.current) {
                rightBottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        }, 50);
    }, [zhToEn, enToZh]);

    // Export meeting records as text file
    const handleExport = () => {
        if (subtitles.length === 0) return;

        const date = new Date().toLocaleDateString('zh-CN');
        const time = new Date().toLocaleTimeString('zh-CN');

        let content = `会议记录\n日期: ${date} ${time}\n${'='.repeat(50)}\n\n`;

        content += `【中文 → 英文】\n${'-'.repeat(30)}\n`;
        zhToEn.forEach((item, index) => {
            content += `[${index + 1}] ${formatTime(item.timestamp)}\n`;
            content += `中文: ${item.sourceText || '-'}\n`;
            content += `英文: ${item.targetText || '-'}\n\n`;
        });

        content += `\n【英文 → 中文】\n${'-'.repeat(30)}\n`;
        enToZh.forEach((item, index) => {
            content += `[${index + 1}] ${formatTime(item.timestamp)}\n`;
            content += `英文: ${item.sourceText || '-'}\n`;
            content += `中文: ${item.targetText || '-'}\n\n`;
        });

        content += `${'='.repeat(50)}\n共 ${subtitles.length} 条记录\n`;

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

    // Render a single message item
    const renderItem = (item: SubtitleItem, _index: number, isZhToEn: boolean) => (
        <motion.div
            key={item.id}
            className="subtitle-item"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <div className="subtitle-content">
                <div className="subtitle-row source-row">
                    <span className={`lang-tag ${isZhToEn ? 'zh-tag' : 'en-tag'}`}>
                        {isZhToEn ? '中' : 'EN'}
                    </span>
                    <p className="subtitle-text">{item.sourceText || '-'}</p>
                </div>
                <div className="subtitle-row target-row">
                    <span className={`lang-tag ${isZhToEn ? 'en-tag' : 'zh-tag'}`}>
                        {isZhToEn ? 'EN' : '中'}
                    </span>
                    <p className="subtitle-text">{item.targetText || '-'}</p>
                </div>
            </div>
            <div className="subtitle-time">{formatTime(item.timestamp)}</div>
        </motion.div>
    );

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

            {/* Two-column layout */}
            <div className="subtitle-columns">
                {/* Left: Chinese to English */}
                <div className="subtitle-column left-column">
                    <div className="column-header">
                        <span className="column-title">🇨🇳 中文 → 英文 🇺🇸</span>
                        <span className="column-count">{zhToEn.length}</span>
                    </div>
                    <div className="column-content">
                        <AnimatePresence>
                            {zhToEn.length === 0 && isEmpty ? (
                                <div className="empty-column">
                                    <MessageSquare size={24} />
                                    <span>等待中文输入...</span>
                                </div>
                            ) : (
                                zhToEn.map((item, index) => renderItem(item, index, true))
                            )}
                        </AnimatePresence>
                        <div ref={leftBottomRef} />
                    </div>
                </div>

                {/* Right: English to Chinese */}
                <div className="subtitle-column right-column">
                    <div className="column-header">
                        <span className="column-title">🇺🇸 英文 → 中文 🇨🇳</span>
                        <span className="column-count">{enToZh.length}</span>
                    </div>
                    <div className="column-content">
                        <AnimatePresence>
                            {enToZh.length === 0 && isEmpty ? (
                                <div className="empty-column">
                                    <MessageSquare size={24} />
                                    <span>Waiting for English input...</span>
                                </div>
                            ) : (
                                enToZh.map((item, index) => renderItem(item, index, false))
                            )}
                        </AnimatePresence>
                        <div ref={rightBottomRef} />
                    </div>
                </div>
            </div>
        </section>
    );
}
