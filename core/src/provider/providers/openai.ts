/**
 * @fileoverview Implementation of the OpenAI language model provider.
 * Handles streaming responses, tool execution requests, and error handling for OpenAI interactions.
 *
 * @module provider/providers/openai
 */

import OpenAI from 'openai';
import { createFileLogger, type Logger } from '../../utils/logger/index.js';
import {
  Provider,
  ProviderMessage,
  ProviderResponse,
  ToolDefinition,
  ProviderType,
  ContextUsage,
} from '../types.js';

/**
 * Percentage of context window to allow for tool responses.
 * Limits tool responses to avoid consuming too much context.
 */
const TOOL_RESPONSE_CONTEXT_PERCENTAGE = 0.4; // Use up to 40% of context for tool responses

/**
 * Creates an OpenAI provider instance for handling language model interactions.
 *
 * @returns {Provider} A configured OpenAI provider instance implementing the Provider interface
 *
 * @remarks
 * This factory function creates a fully configured OpenAI provider that handles:
 * - Streaming response generation from OpenAI models
 * - Tool calling capabilities with parameter validation
 * - Message format conversion between internal and OpenAI formats
 * - Error handling and recovery strategies
 * - Token counting and context length management
 */
export const createOpenAIProvider = (): Provider => {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    organization: process.env.OPENAI_ORGANIZATION,
  });
  const logger: Logger = createFileLogger();

  /**
   * Get maximum context length for the model currently in use.
   *
   * @returns {number} The maximum context length in tokens
   *
   * @remarks
   * This function provides model-specific context limits based on OpenAI's
   * documented specifications. Defaults to 128000 if the model is not recognized.
   */
  const getMaxContextLength = (): number => {
    const contextLengths: Record<string, number> = {
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'o1-mini': 128000,
    };

    return contextLengths[process.env.OPENAI_MODEL || 'gpt-4o'] || 128000;
  };

  /**
   * Truncates tool results to fit within context window limits.
   *
   * @param {string} result - The tool result string to potentially truncate
   * @returns {string} Truncated tool result with warning if needed
   *
   * @remarks
   * This function ensures tool responses don't consume too much of the context window
   * by limiting them to a percentage of the total context length. If truncation
   * is needed, a warning is added to the response.
   */
  const truncateToolResult = (result: string): string => {
    const maxToolResponseLength = Math.floor(
      getMaxContextLength() * TOOL_RESPONSE_CONTEXT_PERCENTAGE
    );
    const estimatedTokens = Math.ceil(result.length / 4); // Rough estimate of tokens
    if (estimatedTokens <= maxToolResponseLength) {
      return result;
    }

    // If too long, truncate and add warning
    const truncateWarning = '\n[WARNING: Tool response was truncated to fit within context limits]';
    const targetLength = maxToolResponseLength * 4 - truncateWarning.length;
    return result.slice(0, targetLength) + truncateWarning;
  };

  /**
   * Converts internal message format to OpenAI's API format.
   *
   * @param {ProviderMessage[]} messages - Array of internal message objects
   * @returns {Array<OpenAI.Chat.ChatCompletionMessageParam>} OpenAI-formatted messages
   *
   * @remarks
   * This function transforms our internal standardized message format into
   * the specific format required by OpenAI's API. It handles:
   * - Role mapping (including tool → function conversion)
   * - Content formatting for different block types
   * - Function call structures for tool results
   */
  const convertToOpenAIMessages = (
    messages: ProviderMessage[]
  ): Array<OpenAI.Chat.ChatCompletionMessageParam> => {
    return messages.map((msg) => {
      // Base message structure
      const baseMessage: {
        role: 'system' | 'user' | 'assistant' | 'function';
        content: string;
        name?: string;
      } = {
        role: msg.role === 'tool' ? 'function' : (msg.role as 'system' | 'user' | 'assistant'),
        content: Array.isArray(msg.content)
          ? msg.content
              .map((block) => {
                if (block.type === 'text') return block.text || '';
                if (block.type === 'tool_result') {
                  const result =
                    block.toolResult?.error || JSON.stringify(block.toolResult?.result, null, 2);
                  return `[TOOL RESULT] ${block.toolResult?.toolName || 'unknown'}: ${truncateToolResult(
                    result
                  )}`;
                }
                return '';
              })
              .join('\n')
          : msg.content,
      };

      // Add function/tool specific properties
      if (msg.toolResult) {
        baseMessage.name = msg.toolResult.toolName;
      }

      // Cast to specific message types based on role
      if (baseMessage.role === 'system') {
        return {
          role: 'system',
          content: baseMessage.content,
        } as OpenAI.Chat.ChatCompletionSystemMessageParam;
      } else if (baseMessage.role === 'user') {
        return {
          role: 'user',
          content: baseMessage.content,
        } as OpenAI.Chat.ChatCompletionUserMessageParam;
      } else if (baseMessage.role === 'assistant') {
        const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: baseMessage.content,
        };

        // Add function_call if present
        if (msg.toolResult) {
          assistantMsg.function_call = {
            name: msg.toolResult.toolName,
            arguments: JSON.stringify(msg.toolResult.result),
          };
        }

        return assistantMsg;
      } else if (baseMessage.role === 'function') {
        return {
          role: 'function',
          name: baseMessage.name || '',
          content: baseMessage.content,
        } as OpenAI.Chat.ChatCompletionFunctionMessageParam;
      }

      // Should not reach here due to our explicit handling above
      throw new Error(`Unsupported message role: ${baseMessage.role}`);
    });
  };

  /**
   * Converts internal tool definitions to OpenAI's function calling format.
   *
   * @param {ToolDefinition[]} [tools] - Optional array of tool definitions
   * @returns {OpenAI.Chat.ChatCompletionTool[]} OpenAI-formatted tools
   *
   * @remarks
   * This function transforms internal tool definitions into OpenAI's function calling format.
   * It preserves the function name, description, and parameter schema.
   */
  const convertToOpenAITools = (tools?: ToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] => {
    if (!tools) return [];

    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.properties,
          required: tool.parameters.required || [],
        },
      },
    }));
  };

  /**
   * Completes a chat conversation using the OpenAI API.
   *
   * @param {ProviderMessage[]} messages - Array of conversation messages
   * @param {Object} [options] - Optional configuration
   * @param {string} [options.systemPrompt] - System prompt to prepend
   * @param {ToolDefinition[]} [options.tools] - Available tools
   * @returns {AsyncGenerator<ProviderResponse>} Stream of provider responses
   *
   * @remarks
   * This async generator function:
   * - Processes conversation history into OpenAI format
   * - Handles streaming of completions from OpenAI
   * - Parses tool calls from the response
   * - Implements error recovery for malformed tool arguments
   * - Provides detailed logging for debugging
   *
   * It yields responses of various types (text, tool_request) as the
   * model generates them, enabling real-time interaction.
   */
  const complete = async function* (
    messages: ProviderMessage[],
    options?: {
      systemPrompt?: string;
      tools?: ToolDefinition[];
      signal?: AbortSignal;
    }
  ): AsyncGenerator<ProviderResponse, void, unknown> {
    const conversationHistory = convertToOpenAIMessages(messages);

    if (options?.systemPrompt) {
      conversationHistory.unshift({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    let accumulatedText = '';
    let currentToolCall: {
      id: string;
      name: string;
      arguments: string;
    } | null = null;

    try {
      const stream = await openai.chat.completions.create(
        {
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages: conversationHistory,
          stream: true,
          ...(options?.tools && options.tools.length > 0
            ? {
                tools: convertToOpenAITools(options.tools),
                tool_choice: 'auto',
              }
            : {}),
          temperature: parseFloat(process.env.TEMPERATURE || '0.3'),
          max_tokens: parseInt(process.env.MAX_TOKENS || '2000', 10),
        },
        {
          signal: options?.signal,
        }
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0].delta;

        // Handle regular content
        if (delta.content) {
          accumulatedText += delta.content;
          yield {
            type: 'text',
            content: accumulatedText,
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
          };
        }

        // Handle tool calls
        if (delta.tool_calls && delta.tool_calls.length > 0) {
          const toolCall = delta.tool_calls[0];

          // Initialize new tool call if needed
          if (!currentToolCall && toolCall.id) {
            currentToolCall = {
              id: toolCall.id,
              name: toolCall.function?.name || '',
              arguments: '',
            };
          }

          // Accumulate tool call data
          if (currentToolCall) {
            if (toolCall.function?.name) {
              currentToolCall.name = toolCall.function.name;
            }
            if (toolCall.function?.arguments) {
              currentToolCall.arguments += toolCall.function.arguments;
            }
          }
        }

        // Emit tool call when complete
        if (chunk.choices[0].finish_reason === 'tool_calls' && currentToolCall) {
          try {
            let parameters: Record<string, unknown> = {};

            try {
              // Try to parse the full arguments string
              parameters = JSON.parse(currentToolCall.arguments);
            } catch {
              // Find the first complete JSON object in the string
              const match = currentToolCall.arguments.match(/\{.*?\}/s);
              if (match && match[0]) {
                try {
                  parameters = JSON.parse(match[0]);
                } catch (subParseError) {
                  throw new Error(`Failed to parse even the first JSON object: ${subParseError}`);
                }
              } else {
                throw new Error('No valid JSON object found in arguments');
              }
            }

            yield {
              type: 'tool_request',
              tool: currentToolCall.name,
              parameters,
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              },
            };
          } catch (err) {
            await logger.error('Failed to parse tool parameters', {
              arguments: currentToolCall.arguments,
              error: err instanceof Error ? err.message : String(err),
            });

            // Even if parsing fails, attempt to yield a tool request with the name
            // and a minimal parameters object to allow some form of recovery
            yield {
              type: 'tool_request',
              tool: currentToolCall.name,
              parameters: { _raw: currentToolCall.arguments }, // Pass the raw arguments for debugging
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              },
            };
          }
          currentToolCall = null;
        }
      }
    } catch (error) {
      await logger.error('OpenAI API error', {
        error: error instanceof Error ? error.message : String(error),
      });

      yield {
        type: 'tool_response',
        tool: 'openai_api',
        error: `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    }
  };

  /**
   * Estimates token count for messages.
   *
   * @param {ProviderMessage | ProviderMessage[]} messages - Message(s) to count
   * @returns {Promise<number>} Estimated token count
   *
   * @remarks
   * This is a simplified token counting implementation that uses a character-based
   * estimation approach. For production use, OpenAI's tokenizer would be more accurate.
   * The current implementation divides character count by 4 as a rough approximation.
   */
  const countTokens = async (messages: ProviderMessage | ProviderMessage[]): Promise<number> => {
    // OpenAI provides a tokenizer, but for simplicity we'll use the same character-based
    // estimation as Claude for now. In production, you'd want to use their tokenizer.
    const messageArray = Array.isArray(messages) ? messages : [messages];
    const totalChars = messageArray.reduce(
      (sum, msg) =>
        sum +
        (typeof msg.content === 'string'
          ? msg.content.length
          : msg.content.reduce((s, block) => s + (block.text?.length || 0), 0)),
      0
    );

    return Math.ceil(totalChars / 4);
  };

  /**
   * Checks if this provider supports tool calling.
   *
   * @returns {boolean} Always true for OpenAI provider
   *
   * @remarks
   * All supported OpenAI models in this implementation have tool calling capabilities.
   */
  const supportsToolCalling = (): boolean => {
    return true;
  };

  /**
   * Gets the provider type identifier.
   *
   * @returns {ProviderType} The provider type ('openai')
   */
  const getProviderType = (): ProviderType => {
    return 'openai';
  };

  /**
   * Gets current context usage information.
   *
   * @param {ProviderMessage[]} messages - The conversation history
   * @returns {Promise<ContextUsage>} Context usage information
   *
   * @remarks
   * This function calculates the used tokens, maximum available tokens,
   * and percentage of context used based on the current model and messages.
   */
  const getContextUsage = async (messages: ProviderMessage[]): Promise<ContextUsage> => {
    const usedTokens = await countTokens(messages);
    const maxTokens = getMaxContextLength();
    const percentage = Math.min(100, Math.round((usedTokens / maxTokens) * 100));

    return {
      usedTokens,
      maxTokens,
      percentage,
    };
  };

  return {
    complete,
    countTokens,
    getMaxContextLength,
    getContextUsage,
    supportsToolCalling,
    getProviderType,
  };
};
