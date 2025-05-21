import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StdioClientTransportOptions } from '../index.js';

export const createStdioTransport = (
  command: string,
  args: string[],
  env?: Record<string, string>
): StdioClientTransport => {
  // Ensure PATH from the current process is inherited if not provided
  const transportEnv: Record<string, string> = {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...env,
  };

  const options: StdioClientTransportOptions = {
    command,
    args,
    env: transportEnv,
  };

  return new StdioClientTransport(options);
};
