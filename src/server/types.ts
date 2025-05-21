/**
 * Type definitions for the Server module
 */

import { MCPServer } from '../mcp/client.js';

/**
 * Configuration options for the server
 */
export interface AgentServerConfig {
  /** Port number for the server to listen on */
  port?: number;
  /** Host address for the server to bind to */
  host?: string;
  /** CORS configuration - origin or array of allowed origins */
  corsOrigin?: string | string[];
  /** Provider configuration options */
  providers?: {
    /** Claude provider configuration */
    claude?: {
      /** API key for Claude */
      apiKey?: string;
    };
    /** OpenAI provider configuration */
    openai?: {
      /** API key for OpenAI */
      apiKey?: string;
    };
  };
  /**
   * Optional path to the MCP servers configuration file
   * If not provided, defaults to mcp-servers.json in the project root
   */
  mcpConfigPath?: string;

  /**
   * Optional list of server names to filter by
   * If provided, only servers with matching names will be loaded
   */
  mcpServerNames?: string[];

  /**
   * Optional predefined MCP server configurations
   * If provided, these will be used instead of loading from file
   */
  mcpServers?: MCPServer[];
}

/**
 * Token and context usage information
 */
export interface TokenUsage {
  /** Number of tokens used in the current conversation */
  usedTokens: number;
  /** Maximum tokens allowed by the model */
  maxTokens: number;
  /** Percentage of context window used (0-100) */
  percentage: number;
}

/**
 * SSE connection interface for streaming responses
 */
export interface SSEConnection {
  /** Unique identifier for the connection */
  id: string;
  /** Method to send an event with data to the client */
  send: (event: string, data: unknown) => void;
  /** Method to close the connection */
  close: () => void;
}

/**
 * Tool request data for client-side execution
 */
export interface ToolRequest {
  /** The name of the tool to execute */
  tool: string;
  /** Parameters for the tool execution */
  parameters: Record<string, unknown>;
  /** Unique identifier for the request */
  requestId: string;
  /** Human readable tool call */
  humanReadableToolCall?: string;
}

/**
 * Response format for API endpoints
 */
export interface ApiResponse<T> {
  /** Whether the operation was successful */
  success: boolean;
  /** Optional error message in case of failure */
  error?: string;
  /** Optional data returned from the operation */
  data?: T;
}

/**
 * Query request from client
 */
export interface QueryRequest {
  /** The user's query text */
  query: string;
  /** Optional conversation ID for continuing existing conversations */
  conversationId?: string;
  /** Optional context data for the query */
  context?: Record<string, unknown>;
  /** Optional provider name to use */
  providerName?: string;
}

/**
 * Tool result data sent from client
 */
export interface ToolResultRequest {
  /** The conversation ID this tool result belongs to */
  conversationId: string;
  /** The request ID this result is responding to */
  requestId: string;
  /** The result data from the tool execution */
  result?: unknown;
  /** Optional error message if tool execution failed */
  error?: string;
}

/**
 * Provider information
 */
export interface ProviderInfo {
  /** Provider name */
  name: string;
  /** Available models for this provider */
  models: string[];
}
