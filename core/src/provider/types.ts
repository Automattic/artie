import { ToolMetadata } from '../agent/types.js';

/**
 * Provider type identification
 */
export type ProviderType = 'openai' | 'anthropic';

/**
 * Configuration for a provider
 */
export interface ProviderConfig {
  // Common configuration
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;

  // Provider-specific configuration (extensible)
  providerOptions?: {
    openai?: {
      organization?: string;
      responseFormat?: 'json_object' | 'text';
    };
    anthropic?: {
      // Anthropic-specific options
      fallbackToText?: boolean;
    };
  };
}

/**
 * Content block for rich content support
 */
export interface ContentBlock {
  type: 'text' | 'image' | 'tool_result';
  text?: string;
  imageUrl?: string;
  toolResult?: {
    toolName: string;
    result: unknown;
    error?: string;
  };
}

/**
 * Standardized message format for all providers
 */
export interface ProviderMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ContentBlock[];
  toolResult?: {
    toolName: string;
    result: unknown;
    error?: string;
  };
}

/**
 * Unified tool definition interface
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

/**
 * Tool parameter property definition
 */
export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
}

/**
 * Tool call result interface
 */
export interface ToolCallResult {
  name: string;
  result?: unknown;
  error?: string;
}

/**
 * Base provider response structure shared across the application
 */
export interface BaseProviderResponse {
  type: 'text' | 'tool_request' | 'tool_response';
  content?: string;
  tool?: string;
  parameters?: Record<string, unknown>;
  error?: string;
  toolMetadata?: ToolMetadata;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  isComplete?: boolean;
}

/**
 * Usage information for a provider response
 */
export interface ProviderUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Context usage information
 */
export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  percentage: number;
}

/**
 * Response from a provider with usage statistics
 */
export interface ProviderResponse extends BaseProviderResponse {
  usage: ProviderUsage;
  hasToolCalls?: boolean;
}

/**
 * Base interface for a provider
 */
export interface BaseProvider {
  /**
   * Send a completion request to the provider
   * @returns A stream of provider responses
   */
  complete: (
    messages: ProviderMessage[],
    options?: {
      systemPrompt?: string;
      tools?: ToolDefinition[];
    }
  ) => AsyncGenerator<BaseProviderResponse | ProviderResponse, void, unknown>;
}

/**
 * Interface for a provider with advanced capabilities
 */
export interface Provider extends BaseProvider {
  /**
   * Send a completion request to the provider
   * @param messages The conversation history
   * @param options Optional configuration including system prompt and tools
   * @returns A stream of provider responses
   */
  complete: (
    messages: ProviderMessage[],
    options?: {
      systemPrompt?: string;
      tools?: ToolDefinition[];
      signal?: AbortSignal;
    }
  ) => AsyncGenerator<ProviderResponse, void, unknown>;

  /**
   * Get the token count for a message or array of messages
   */
  countTokens: (messages: ProviderMessage | ProviderMessage[]) => Promise<number>;

  /**
   * Get the maximum context length for the current model
   */
  getMaxContextLength: () => number;

  /**
   * Get current context usage information
   * @param messages The conversation history to calculate usage for
   * @returns Context usage information including percentage
   */
  getContextUsage: (messages: ProviderMessage[]) => Promise<ContextUsage>;

  /**
   * Check if the provider supports tool calling
   */
  supportsToolCalling: () => boolean;

  /**
   * Get the type of the provider
   */
  getProviderType: () => ProviderType;
}
