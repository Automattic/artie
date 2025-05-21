#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { render } from 'ink';
import React from 'react';

import { AppProvider } from './context/AppContext.js';
import App from './ui/App.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from various possible locations
const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });

// Parse command line arguments
const args = process.argv.slice(2);
let serverNames: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--servers=')) {
    const serversArg = args[i].substring('--servers='.length);
    serverNames = serversArg.split(',').map(name => name.trim()).filter(Boolean);
    break;
  }
}

// Create a custom provider that sets server names during initialization
const ServerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initialized, setInitialized] = React.useState(false);

  React.useEffect(() => {
    setInitialized(true);
  }, []);

  if (!initialized) {
    return null;
  }

  return (
    <AppProvider initialServerNames={serverNames}>
      {children}
    </AppProvider>
  );
};

// Render the app
const { unmount, waitUntilExit } = render(
  <ServerProvider>
    <App />
  </ServerProvider>
);

// Handle process termination
process.on('SIGINT', () => {
  unmount();
});

// Wait for the app to exit
waitUntilExit().then(() => {
  process.exit(0);
});
