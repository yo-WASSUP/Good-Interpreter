import { motion } from 'framer-motion';
import './BackgroundEffects.css';

export function BackgroundEffects() {
    return (
        <div className="background-effects">
            <motion.div
                className="gradient-orb orb-1"
                animate={{
                    x: [0, 30, -20, -30, 0],
                    y: [0, -30, 20, -20, 0],
                    scale: [1, 1.05, 0.95, 1.02, 1],
                }}
                transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: 'easeInOut',
                }}
            />
            <motion.div
                className="gradient-orb orb-2"
                animate={{
                    x: [0, -20, 30, -10, 0],
                    y: [0, 20, -30, 10, 0],
                    scale: [1, 0.95, 1.05, 0.98, 1],
                }}
                transition={{
                    duration: 25,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: 2,
                }}
            />
            <motion.div
                className="gradient-orb orb-3"
                animate={{
                    x: [0, 40, -30, 20, 0],
                    y: [0, -20, 40, -30, 0],
                    scale: [1, 1.08, 0.92, 1.04, 1],
                }}
                transition={{
                    duration: 22,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: 5,
                }}
            />
        </div>
    );
}
