/**
 * @fileoverview Type definitions for MCP transport mechanisms.
 */

import type { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Union type representing supported transport mechanisms for MCP communication.
 * Can be either SSE (Server-Sent Events) or stdio (Standard Input/Output) based transport.
 */
export type Transport = SSEClientTransport | StdioClientTransport;

/**
 * Configuration options for stdio-based transport.
 * @interface StdioClientTransportOptions
 * @property {string} command - The command to execute for stdio communication
 * @property {string[]} args - Command line arguments to pass to the command
 * @property {Record<string, string>} [env] - Optional environment variables for the command
 * @property {boolean} [shell] - Whether to run the command in a shell
 */
export interface StdioClientTransportOptions {
  command: string;
  args: string[];
  env?: Record<string, string>;
  shell?: boolean;
}
