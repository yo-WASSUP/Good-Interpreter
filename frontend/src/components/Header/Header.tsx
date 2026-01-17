import { Mic } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ConnectionStatus } from '../../types';
import './Header.css';

interface HeaderProps {
    status: ConnectionStatus;
}

const statusConfig: Record<ConnectionStatus, { text: string; className: string }> = {
    disconnected: { text: '等待连接', className: '' },
    connecting: { text: '正在连接...', className: '' },
    connected: { text: '已连接', className: 'connected' },
    recording: { text: '正在录音...', className: 'recording' },
    error: { text: '连接错误', className: 'error' },
};

export function Header({ status }: HeaderProps) {
    const config = statusConfig[status];

    return (
        <header className="header">
            <div className="logo">
                <motion.div
                    className="logo-icon"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <Mic size={28} />
                </motion.div>
                <h1>
                    实时翻译
                    <span className="logo-highlight">Translator</span>
                </h1>
            </div>

            <motion.div
                className={`status-badge ${config.className}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
            >
                <span className="status-dot" />
                <span className="status-text">{config.text}</span>
            </motion.div>
        </header>
    );
}
