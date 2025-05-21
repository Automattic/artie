import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { LogProvider, useLogging, LogContext } from '../../utils/logging.js';

// Create a simplified version of the tests without jest-dom matchers
describe('Logging', () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleInfo: typeof console.info;

  beforeEach(() => {
    // Save original console methods
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    originalConsoleInfo = console.info;
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.info = originalConsoleInfo;

    vi.clearAllMocks();
  });

  describe('LogProvider', () => {
    it('should render children', () => {
      const { getByText } = render(
        <LogProvider>
          <div>Test Child</div>
        </LogProvider>
      );

      expect(getByText('Test Child')).toBeDefined();
    });

    it('should override console methods and capture logs', async () => {
      // Create a test component to render logs
      const MockComponent = () => {
        const { logs } = useLogging();
        return (
          <div>
            {logs.map((log, index) => (
              <div key={index} data-testid={`log-${index}`}>
                {log}
              </div>
            ))}
          </div>
        );
      };

      const { getByTestId } = render(
        <LogProvider>
          <MockComponent />
        </LogProvider>
      );

      // Directly trigger console methods
      act(() => {
        console.log('Test log message');
        console.error('Test error message');
        console.warn('Test warning message');
        console.info('Test info message');
      });

      // Wait for render cycle to complete
      await vi.waitFor(
        () => {
          // Check that logs were captured
          expect(getByTestId('log-0').textContent).toBe('Test log message');
          expect(getByTestId('log-1').textContent).toBe('ERROR: Test error message');
          expect(getByTestId('log-2').textContent).toBe('WARN: Test warning message');
          expect(getByTestId('log-3').textContent).toBe('INFO: Test info message');
        },
        { timeout: 3000 }
      );
    });
  });

  describe('useLogging', () => {
    it('should add logs via addLog function', async () => {
      // Create a test component that directly adds logs
      const MockComponent = () => {
        const { logs, addLog } = useLogging();

        React.useEffect(() => {
          addLog('Direct log message');
        }, [addLog]);

        return (
          <div>
            {logs.map((log, index) => (
              <div key={index} data-testid={`log-${index}`}>
                {log}
              </div>
            ))}
          </div>
        );
      };

      const { getByTestId } = render(
        <LogProvider>
          <MockComponent />
        </LogProvider>
      );

      // Wait for render cycle to complete
      await vi.waitFor(
        () => {
          expect(getByTestId('log-0').textContent).toBe('Direct log message');
        },
        { timeout: 3000 }
      );
    });
  });
});
