import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Logger, LogLevel, LogEntry } from './types.js';

/**
 * File-based logger implementation that logs to debug.log in the root directory
 */
export const createFileLogger = (): Logger => {
  // Get the directory path of the current module
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Navigate up to the repo root (4 levels up from packages/core/src/utils/logger)
  const repoRoot = path.resolve(__dirname, '../../../../..');
  const logPath = path.join(repoRoot, 'debug.log');

  const log = async (level: LogLevel, message: string, data?: unknown): Promise<void> => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };

    const logLine = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${
      data ? `\n${JSON.stringify(data, null, 2)}` : ''
    }\n`;

    await fs.appendFile(logPath, logLine, 'utf-8');
  };

  return {
    debug: (message: string, data?: unknown) => log('debug', message, data),
    info: (message: string, data?: unknown) => log('info', message, data),
    warn: (message: string, data?: unknown) => log('warn', message, data),
    error: (message: string, data?: unknown) => log('error', message, data),
  };
};
