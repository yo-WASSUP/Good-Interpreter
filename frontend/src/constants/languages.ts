import type { Language } from '../types';

export const LANGUAGES: Language[] = [
    { code: 'zh', label: '中文', nativeLabel: '中文' },
    { code: 'en', label: 'English', nativeLabel: 'EN' },
];

export const getLanguageLabel = (code: string): string => {
    const lang = LANGUAGES.find(l => l.code === code);
    return lang?.nativeLabel || code.toUpperCase();
};

export const getLanguageName = (code: string): string => {
    const lang = LANGUAGES.find(l => l.code === code);
    return lang?.label || code;
};
