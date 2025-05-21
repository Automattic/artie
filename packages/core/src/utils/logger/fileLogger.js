import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
/**
 * File-based logger implementation that logs to debug.log in the root directory
 */
export const createFileLogger = () => {
    // Get the directory path of the current module
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Navigate up to the repo root (4 levels up from packages/core/src/utils/logger)
    const repoRoot = path.resolve(__dirname, '../../../../..');
    const logPath = path.join(repoRoot, 'debug.log');
    const log = async (level, message, data) => {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            data,
        };
        const logLine = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${data ? `\n${JSON.stringify(data, null, 2)}` : ''}\n`;
        await fs.appendFile(logPath, logLine, 'utf-8');
    };
    return {
        debug: (message, data) => log('debug', message, data),
        info: (message, data) => log('info', message, data),
        warn: (message, data) => log('warn', message, data),
        error: (message, data) => log('error', message, data),
    };
};
