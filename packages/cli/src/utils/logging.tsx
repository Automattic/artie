import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

// Create a logging context
export const LogContext = createContext<{
  logs: string[];
  addLog: (message: string) => void;
}>({
  logs: [],
  addLog: () => {},
});

/**
 * Custom hook for accessing and updating logs
 */
export const useLogging = (): { logs: string[]; addLog: (message: string) => void } => {
  const context = useContext(LogContext);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!context) {
    throw new Error('useLogging must be used within a LogProvider');
  }
  return context;
};

/**
 * Provider component that manages logs and overrides console methods
 */
export const LogProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [logs, setLogs] = useState<string[]>([]);

  // Add log handler
  const addLog = useCallback((message: string): void => {
    setLogs((prev) => [...prev, message]);
  }, []);

  // Override console.log to redirect to our logging system
  useEffect(() => {
    const originalConsoleLog = console.log;

    console.log = (...args): void => {
      // Call original console.log for debugging if needed
      originalConsoleLog(...args);

      // Process each argument and add to our logs
      args.forEach((arg) => {
        let formattedMessage: string;
        if (typeof arg === 'object' && arg !== null) {
          try {
            formattedMessage = JSON.stringify(arg, null, 2);
          } catch {
            formattedMessage = String(arg);
          }
        } else {
          formattedMessage = String(arg);
        }

        addLog(formattedMessage);
      });
    };

    // Also override console.error, console.warn, etc.
    const originalConsoleError = console.error;
    console.error = (...args): void => {
      originalConsoleError(...args);
      args.forEach((arg) => addLog(`ERROR: ${String(arg)}`));
    };

    const originalConsoleWarn = console.warn;
    console.warn = (...args): void => {
      originalConsoleWarn(...args);
      args.forEach((arg) => addLog(`WARN: ${String(arg)}`));
    };

    const originalConsoleInfo = console.info;
    console.info = (...args): void => {
      originalConsoleInfo(...args);
      args.forEach((arg) => addLog(`INFO: ${String(arg)}`));
    };

    return (): void => {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      console.info = originalConsoleInfo;
    };
  }, [addLog]);

  return <LogContext.Provider value={{ logs, addLog }}>{children}</LogContext.Provider>;
};
