import { vi } from 'vitest';

// Mock process.env
process.env = {
  ...process.env,
  NODE_ENV: 'test',
};

// Mock crypto.randomUUID
vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid'),
}));

// Mock console methods
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};
