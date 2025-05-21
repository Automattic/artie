/**
 * Server port - configurable via PORT environment variable
 */
export const DEFAULT_PORT: number = parseInt(process.env.SERVER_PORT || '7777', 10);

/**
 * Server host - configurable via HOST environment variable
 */
export const DEFAULT_HOST: string = process.env.SERVER_HOST || 'localhost';

/**
 * Default conversation cleanup interval (5 minutes)
 */
export const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Default conversation max age (1 hour)
 */
export const DEFAULT_CONVERSATION_MAX_AGE_MS = 60 * 60 * 1000;
