import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import './CurrentTranslation.css';

interface CurrentTranslationProps {
    originalText: string;
    translatedText: string;
    isInterimOriginal?: boolean;
    isInterimTranslation?: boolean;
}

export function CurrentTranslation({
    originalText,
    translatedText,
    isInterimOriginal,
    isInterimTranslation,
}: CurrentTranslationProps) {
    return (
        <section className="current-translation">
            <motion.div
                className="translation-card original"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
            >
                <div className="translation-label">
                    <span className="lang-badge">原文</span>
                </div>
                <p className={`translation-text ${isInterimOriginal ? 'interim' : ''}`}>
                    {originalText || '-'}
                </p>
            </motion.div>

            <div className="translation-divider">
                <ArrowRight size={24} />
            </div>

            <motion.div
                className="translation-card translated"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
            >
                <div className="translation-label">
                    <span className="lang-badge">译文</span>
                </div>
                <p className={`translation-text ${isInterimTranslation ? 'interim' : ''}`}>
                    {translatedText || '-'}
                </p>
            </motion.div>
        </section>
    );
}
