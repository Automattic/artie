declare global {
  interface Window {
    cleanExit?: (code?: number) => never;
  }
}

/**
 * Access the cleanExit function from the global scope or fallback to process.exit
 */
export const cleanExit = (code = 0): never => {
  if (typeof window !== 'undefined' && window.cleanExit) {
    window.cleanExit(code);
  }

  if (typeof global !== 'undefined' && (global as any).cleanExit) {
    (global as any).cleanExit(code);
  }

  process.exit(code);
  // This line is unreachable but needed for TypeScript
  throw new Error('Unreachable');
};

/**
 * Check if we're already in the process of exiting
 */
export const isExiting = (): boolean =>
  (typeof global !== 'undefined' && (global as any).isExiting) || false;
