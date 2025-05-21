#!/usr/bin/env node

/**
 * Standalone server entry point
 *
 * This file provides a CLI for starting the Artie server
 * as a standalone application.
 */

import 'dotenv/config';
import { createExpressServer } from './adapters/express-adapter.js';
import { loadConfig, validateConfig } from './config.js';
import { DEFAULT_PORT, DEFAULT_HOST } from './constants.js';

/**
 * Main entry point for the standalone server
 */
const main = async (): Promise<void> => {
  try {
    console.log('Starting Artie Core Server...');

    // Load configuration
    const config = loadConfig();

    // Validate configuration
    const validationError = validateConfig(config);
    if (validationError) {
      console.error(`Configuration error: ${validationError}`);
      process.exit(1);
    }

    // Create and start the server
    const server = createExpressServer(config);
    const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
    const host = process.env.HOST || DEFAULT_HOST;

    await server.start(port, host);

    console.log(`Server running at http://${host}:${port}`);
    console.log('Press Ctrl+C to stop');
    console.log('[Standalone] Server started successfully. Main process continuing.');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Standalone] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Standalone] Uncaught Exception:', error);
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  console.error('[Standalone] Fatal error during main execution:', error);
  process.exit(1);
});
