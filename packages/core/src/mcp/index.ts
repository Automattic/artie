/**
 * @fileoverview Main exports for the Model Context Protocol (MCP) client library.
 * Provides types and factory functions for MCP client, transports, and related interfaces.
 */

// Type exports
export type { Tool, ToolResponse } from './types/tool.js';
export type { Resource } from './types/resource.js';
export type { Prompt, PromptResult } from './types/prompt.js';
export type { ServerConfig } from './types/config.js';
export type { MCPClient, MCPServer } from './client.js';
export type { Transport, StdioClientTransportOptions } from './types/transport.js';

// Function exports
export { createMCPClient } from './client.js';
export { createStdioTransport } from './transports/stdio.js';
export { createSSETransport } from './transports/sse.js';
