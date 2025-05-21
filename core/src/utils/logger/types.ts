/**
 * Available log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
}

/**
 * Logger interface that all logger implementations must follow
 */
export interface Logger {
  debug: (message: string, data?: unknown) => Promise<void>;
  info: (message: string, data?: unknown) => Promise<void>;
  warn: (message: string, data?: unknown) => Promise<void>;
  error: (message: string, data?: unknown) => Promise<void>;
}
