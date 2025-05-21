import { MCPClient } from '../mcp/index.js';
import { Provider } from '../provider/types.js';
import { BaseProviderResponse } from '../provider/types.js';

/**
 * Message role types for the chat system
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Metadata for tool-related information
 */
export interface ToolMetadata {
  description?: string;
  // Future tool-related metadata can be added here
}

/**
 * Base message interface that all message types extend
 */
export interface Message {
  id: string;
  role: MessageRole;
  type: 'text' | 'tool_request' | 'tool_response';
  content?: string;
  tool?: string;
  parameters?: Record<string, unknown>;
  error?: string;
  toolMetadata?: ToolMetadata;
  createdAt: string;
  isComplete?: boolean;
}

/**
 * Text message interface for standard chat messages
 */
export interface TextMessage extends Message {
  type: 'text';
  content: string;
}

/**
 * Tool request message interface for when the assistant requests to use a tool
 */
export interface ToolRequestMessage extends Message {
  type: 'tool_request';
  tool: string;
  parameters: Record<string, unknown>;
  toolMetadata?: ToolMetadata;
}

/**
 * Tool response message interface for tool execution results
 */
export interface ToolResponseMessage extends Message {
  type: 'tool_response';
  tool: string;
  result: unknown;
  error?: string;
  toolMetadata?: ToolMetadata;
}

/**
 * Queued tool request interface for managing tool execution order
 */
export interface QueuedToolRequest {
  id: string;
  tool: string;
  parameters: Record<string, unknown>;
}

/**
 * Configuration for creating a new agent instance
 */
export interface AgentConfig {
  provider: Provider;
  mcpClient: MCPClient;
}

export interface Agent {
  processQuery(
    query: string,
    context?: Record<string, any>,
    signal?: AbortSignal
  ): AsyncGenerator<Message, void, unknown>;
  getMessages(): Message[];
  clearHistory(): void;
  mcpClient: MCPClient;
  provider: Provider;
  getContextUsage(messages: Message[]): Promise<{
    usedTokens: number;
    maxTokens: number;
    percentage: number;
  }>;
}

export interface AgentProviderResponse extends BaseProviderResponse {
  type: 'text' | 'tool_request' | 'tool_response';
  content?: string;
  tool?: string;
  parameters?: Record<string, unknown>;
  error?: string;
  toolMetadata?: ToolMetadata;
}

export type ToolExecutionResult = {
  isError: boolean;
  content?: unknown;
  error?: string;
};
