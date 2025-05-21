/**
 * @fileoverview Enhanced implementation of the Claude language model provider using Anthropic's API.
 * Handles streaming responses, tool execution requests, and error handling for Claude interactions.
 * Improved to handle all possible streaming events and tool call formats.
 *
 * @module provider/providers/claude
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { createFileLogger, type Logger } from '../../utils/logger/index.js';

import type {
  MessageParam,
  Tool as AnthropicTool,
  MessageCreateParamsStreaming,
  MessageStream,
  ToolChoice,
  RawMessageStreamEvent,
  RawContentBlockDeltaEvent,
  RawContentBlockStartEvent,
  RawContentBlockStopEvent,
  RawMessageStartEvent,
  RawMessageDeltaEvent,
  RawMessageStopEvent,
} from '@anthropic-ai/sdk/resources/messages/messages.mjs';

import {
  Provider,
  ProviderMessage,
  ProviderResponse,
  ToolDefinition,
  ProviderType,
  ContextUsage,
} from '../types.js';

import {
  containsFinalAnswerTag,
  extractToolCallFromText,
  safeParseToolParameters,
  truncateToolResult,
} from '../utils.js';

// Fallback model in case the model is not specified in .env
const FALLBACK_MODEL = 'claude-3-7-sonnet-20250219';

// Model information mapping using date-based versions
const MODEL_INFO = {
  // Proper date-based model names
  'claude-3-7-sonnet-20250219': { contextLength: 200000 },
  'claude-3-5-sonnet-20240620': { contextLength: 200000 },
  'claude-3-5-haiku-20240307': { contextLength: 200000 },
  'claude-3-haiku-20240307': { contextLength: 100000 },
};

/**
 * Creates a Claude provider instance for handling language model interactions.
 *
 * @returns {Provider} A configured Claude provider instance implementing the Provider interface
 *
 * @remarks
 * This factory function creates a fully configured Claude provider that handles:
 * - Streaming response generation from Anthropic Claude models
 * - Tool use capabilities with parameter validation and parsing
 * - Message format conversion between internal and Claude formats
 * - Error handling with detailed error information extraction
 * - Token counting and context window management
 * - Tool response truncation to fit within context limits
 */
export const createClaudeProvider = (): Provider => {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  const logger: Logger = createFileLogger();

  /**
   * Gets the maximum context length for the model currently in use.
   *
   * @returns {number} The maximum context length in tokens
   *
   * @remarks
   * This function provides model-specific context limits based on Anthropic's
   * documented specifications. Defaults to 100000 if the model is not recognized.
   */
  const getMaxContextLength = (): number => {
    const modelName = process.env.ANTHROPIC_MODEL || FALLBACK_MODEL;
    return MODEL_INFO[modelName]?.contextLength || 100000;
  };

  /**
   * Converts internal message format to Claude's API format.
   *
   * @param {ProviderMessage[]} messages - Array of internal message objects
   * @returns {MessageParam[]} Claude-formatted messages
   *
   * @remarks
   * This function transforms our internal standardized message format into
   * the specific format required by Claude's API. It handles:
   * - Role mapping (including system → user conversion for Claude)
   * - Content formatting for different block types
   * - Tool result formatting with truncation for context management
   */
  const convertToClaudeMessages = (messages: ProviderMessage[]): MessageParam[] => {
    return messages.map((msg) => ({
      role: msg.role === 'system' ? 'user' : (msg.role as 'user' | 'assistant'),
      content: Array.isArray(msg.content)
        ? msg.content
            .map((block) => {
              if (block.type === 'text') return block.text || '';
              if (block.type === 'tool_result') {
                const result =
                  block.toolResult?.error || JSON.stringify(block.toolResult?.result, null, 2);
                return `[TOOL RESULT] ${
                  block.toolResult?.toolName || 'unknown'
                }: ${truncateToolResult(result, getMaxContextLength())}`;
              }
              return '';
            })
            .join('\n')
        : msg.content,
    }));
  };

  /**
   * Converts internal tool definitions to Claude's tool use format.
   *
   * @param {ToolDefinition[]} [tools] - Optional array of tool definitions
   * @returns {AnthropicTool[]} Claude-formatted tools
   *
   * @remarks
   * This function transforms internal tool definitions into Claude's tool use format.
   * It preserves the function name, description, and parameter schema.
   *
   * Additionally, it enhances tool descriptions with reminders to include
   * required parameters, which helps Claude make better tool calls.
   */
  const convertToClaudeTools = (tools?: ToolDefinition[]): AnthropicTool[] => {
    if (!tools) return [];

    return tools.map((tool) => {
      const formattedSchema = {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required || [],
      };

      const enhancedDescription =
        tool.description +
        (tool.description.includes('required parameters')
          ? ''
          : ' IMPORTANT: You MUST include all required parameters directly in your tool call.');

      return {
        name: tool.name,
        description: enhancedDescription,
        input_schema: formattedSchema,
      } as AnthropicTool;
    });
  };

  /**
   * Completes a chat conversation using the Claude API.
   *
   * @param {ProviderMessage[]} messages - Array of conversation messages
   * @param {Object} [options] - Optional configuration
   * @param {string} [options.systemPrompt] - System prompt to prepend
   * @param {ToolDefinition[]} [options.tools] - Available tools
   * @returns {AsyncGenerator<ProviderResponse>} Stream of provider responses
   *
   * @remarks
   * This async generator function:
   * - Processes conversation history into Claude format
   * - Handles streaming of completions from Claude
   * - Parses tool use events from the response
   * - Implements error recovery for partially-formed tool parameters
   * - Provides detailed logging for debugging
   * - Enhanced to handle more event types and tool call formats
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
    // Map messages to Claude's format
    const conversationHistory: MessageParam[] = convertToClaudeMessages(messages);

    if (options?.systemPrompt) {
      conversationHistory.unshift({
        role: 'user',
        content: options.systemPrompt,
      });
    }

    let accumulatedText = '';
    let toolCall: {
      name: string;
      parameters: Record<string, unknown>;
      accumulatedJson: string;
    } | null = null;

    // For detecting possible tool calls in text
    let lastTextTimestamp = 0;
    let textSinceLastCheck = '';
    const TEXT_CHECK_INTERVAL = 500; // ms

    // Flag to track if we've completed the message
    let isMessageComplete = false;
    // Flag to indicate if a tool call was found but not yet executed
    let pendingToolCall: {
      name: string;
      parameters: Record<string, unknown>;
    } | null = null;
    // Flag to track if the response contains a final answer
    let containsFinalAnswer = false;

    try {
      const claudeConfig: MessageCreateParamsStreaming = {
        model: process.env.ANTHROPIC_MODEL || FALLBACK_MODEL,
        max_tokens: parseInt(process.env.MAX_TOKENS || '2000', 10),
        messages: conversationHistory,
        stream: true,
        ...(options?.tools && options.tools.length > 0
          ? {
              tools: convertToClaudeTools(options.tools),
              tool_choice: { type: 'auto' } as ToolChoice,
            }
          : {}),
        temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      };

      // Streaming mode
      const stream = await anthropic.messages.create(claudeConfig, {
        signal: options?.signal,
      });

      for await (const event of stream) {
        // Type guards for the different event types
        const isContentBlockDelta = (e: RawMessageStreamEvent): e is RawContentBlockDeltaEvent =>
          e.type === 'content_block_delta';
        const isContentBlockStart = (e: RawMessageStreamEvent): e is RawContentBlockStartEvent =>
          e.type === 'content_block_start';
        const isContentBlockStop = (e: RawMessageStreamEvent): e is RawContentBlockStopEvent =>
          e.type === 'content_block_stop';
        const isMessageStop = (e: RawMessageStreamEvent): e is RawMessageStopEvent =>
          e.type === 'message_stop';
        const isMessageStart = (e: RawMessageStreamEvent): e is RawMessageStartEvent =>
          e.type === 'message_start';
        const isMessageDelta = (e: RawMessageStreamEvent): e is RawMessageDeltaEvent =>
          e.type === 'message_delta';

        // Handle different event types
        if (isContentBlockDelta(event)) {
          if (event.delta.type === 'text_delta') {
            accumulatedText += event.delta.text;
            textSinceLastCheck += event.delta.text;

            // Check if the response contains a final answer tag
            if (!containsFinalAnswer && containsFinalAnswerTag(event.delta.text)) {
              containsFinalAnswer = true;
            }

            // Only detect tool calls with <tool_call> tags during streaming
            // but don't execute them immediately - just mark them as pending
            const now = Date.now();
            if (
              now - lastTextTimestamp > TEXT_CHECK_INTERVAL &&
              !toolCall &&
              !pendingToolCall &&
              options?.tools
            ) {
              lastTextTimestamp = now;

              // Check if text contains a tool call signature with clear tags
              const toolCallTagPattern = /<tool_call>([\s\S]*?)<\/tool_call>/i;
              if (toolCallTagPattern.test(textSinceLastCheck)) {
                const extractedToolCall = extractToolCallFromText(
                  textSinceLastCheck,
                  options.tools
                );
                if (extractedToolCall && extractedToolCall.name) {
                  // Store the tool call for later execution after the message is complete
                  pendingToolCall = extractedToolCall;
                }
              }
            }

            yield {
              type: 'text',
              content: accumulatedText,
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              },
            };
          } else if (event.delta.type === 'input_json_delta' && toolCall) {
            // Handle tool parameter JSON
            if (event.delta.partial_json) {
              toolCall.accumulatedJson += event.delta.partial_json;
            }
          }
        } else if (isContentBlockStart(event)) {
          if (event.content_block.type === 'tool_use') {
            let toolName = '';
            // Extract tool name from different possible shapes of content_block
            if ('name' in event.content_block && typeof event.content_block.name === 'string') {
              toolName = event.content_block.name;
            } else if ('id' in event.content_block && typeof event.content_block.id === 'string') {
              // Some versions of the API use 'id' instead of 'name'
              toolName = event.content_block.id;
            }

            toolCall = {
              name: toolName,
              parameters: {},
              accumulatedJson: '',
            };

            // Handle case where input is already provided
            if (event.content_block.input) {
              if (typeof event.content_block.input === 'string') {
                // If input is a string, try to parse as JSON
                try {
                  toolCall.parameters = JSON.parse(event.content_block.input);
                } catch {
                  // If parsing fails, use string as-is (might be a simple parameter)
                  toolCall.accumulatedJson = event.content_block.input;
                }
              } else if (typeof event.content_block.input === 'object') {
                // If input is already an object, use directly
                toolCall.parameters = event.content_block.input as Record<string, unknown>;
              }
            }
          }
        } else if (isContentBlockStop(event)) {
          if (toolCall) {
            if (toolCall.accumulatedJson) {
              toolCall.parameters = safeParseToolParameters(
                toolCall.accumulatedJson,
                toolCall.name
              );
            }

            yield {
              type: 'tool_request',
              tool: toolCall.name,
              parameters: toolCall.parameters,
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              },
            };

            // Reset tool call after yielding
            toolCall = null;
          }
        } else if (isMessageStop(event)) {
          // Mark the message as complete
          isMessageComplete = true;

          // Final text update if needed
          if (accumulatedText) {
            yield {
              type: 'text',
              content: accumulatedText,
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              },
              isComplete: true,
            };
          }

          // Check for final answer tag in the complete text if not already found
          if (!containsFinalAnswer && containsFinalAnswerTag(accumulatedText)) {
            containsFinalAnswer = true;
          }

          // Now that we have the complete message, process any pending tool call
          // But only if there's no final answer tag
          if (pendingToolCall && !containsFinalAnswer) {
            yield {
              type: 'tool_request',
              tool: pendingToolCall.name,
              parameters: pendingToolCall.parameters,
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              },
            };

            pendingToolCall = null;
          }
          // Or check for any tool calls in the complete text if no pending or active tool call
          // and there's no final answer tag - this is a fallback for when the model forgets
          else if (!toolCall && !containsFinalAnswer && options?.tools && accumulatedText) {
            const extractedToolCall = extractToolCallFromText(accumulatedText, options.tools);
            if (extractedToolCall?.name) {
              yield {
                type: 'tool_request',
                tool: extractedToolCall.name,
                parameters: extractedToolCall.parameters,
                usage: {
                  promptTokens: 0,
                  completionTokens: 0,
                  totalTokens: 0,
                },
              };
            }
          }
        } else if (isMessageStart(event) || isMessageDelta(event)) {
          // These events provide metadata we can use for usage tracking
          if ('usage' in event && event.usage) {
            // Nothing to yield, but we could track usage stats here
          }
        } else {
          // Handle any other event type as unknown
          const unknownEvent = event as any;

          // Check if it has an error property
          if ('error' in unknownEvent && unknownEvent.type === 'error') {
            await logger.error('Claude streaming error', {
              error:
                typeof unknownEvent.error === 'object'
                  ? JSON.stringify(unknownEvent.error)
                  : String(unknownEvent.error),
            });
          }
        }
      }

      // After the stream ends, if the message is not complete
      if (!isMessageComplete) {
        // Final text update
        if (accumulatedText) {
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

        // Check for final answer tag in the complete text if not already found
        if (!containsFinalAnswer && containsFinalAnswerTag(accumulatedText)) {
          containsFinalAnswer = true;
        }

        // Process any pending tool call first, but only if no final answer
        if (pendingToolCall && !containsFinalAnswer) {
          yield {
            type: 'tool_request',
            tool: pendingToolCall.name,
            parameters: pendingToolCall.parameters,
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
          };
        }
        // Or check the complete text if no tool call is already in progress
        // and there's no final answer - fallback mechanism only
        else if (!toolCall && !containsFinalAnswer && options?.tools && accumulatedText) {
          const extractedToolCall = extractToolCallFromText(accumulatedText, options.tools);
          if (extractedToolCall?.name) {
            yield {
              type: 'tool_request',
              tool: extractedToolCall.name,
              parameters: extractedToolCall.parameters,
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              },
            };
          }
        }
      }
    } catch (error) {
      await logger.error('Claude API error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Parse the error message if it's a JSON string
      let errorMessage = error instanceof Error ? error.message : String(error);
      let errorType = 'unknown';

      try {
        // Handle case where error is a stringified JSON object
        if (typeof errorMessage === 'string' && errorMessage.includes('"type":"error"')) {
          const parsedError = JSON.parse(errorMessage);
          if (parsedError.error && typeof parsedError.error === 'object') {
            errorMessage = parsedError.error.message || errorMessage;
            errorType = parsedError.error.type || 'unknown';
          }
        }
      } catch (parseError) {
        // If parsing fails, use the original error message
        await logger.error('Failed to parse Claude API error', {
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
        });
      }

      yield {
        type: 'tool_response',
        tool: 'claude_api',
        error: `Claude API ${errorType} error: ${errorMessage}`,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    }
  };

  /**
   * Counts tokens for messages using Anthropic's official token counting API.
   *
   * @param {ProviderMessage | ProviderMessage[]} messages - Message(s) to count
   * @returns {Promise<number>} Exact token count from Anthropic's API
   *
   * @remarks
   * This uses Anthropic's official token counting API for accurate token counts.
   * It converts internal message format to Claude format before counting.
   */
  const countTokens = async (messages: ProviderMessage | ProviderMessage[]): Promise<number> => {
    const messageArray = Array.isArray(messages) ? messages : [messages];

    // Filter out empty messages and clean content
    const validMessages = messageArray
      .map((msg) => {
        // For string content, trim whitespace
        if (typeof msg.content === 'string') {
          return {
            ...msg,
            content: msg.content.trim(),
          };
        }

        // For array content, process each block
        const cleanContent = msg.content
          .map((block) => {
            if (block.type === 'text') {
              return { ...block, text: block.text?.trim() || '' };
            }
            if (block.type === 'tool_result') {
              const result =
                block.toolResult?.error || JSON.stringify(block.toolResult?.result, null, 2);
              return {
                type: 'text' as const,
                text: `[TOOL RESULT] ${block.toolResult?.toolName || 'unknown'}: ${result}`.trim(),
              };
            }
            return block;
          })
          .filter((block) => block.text?.length > 0);

        return {
          ...msg,
          content: cleanContent,
        };
      })
      .filter((msg) => {
        if (typeof msg.content === 'string') {
          return msg.content.length > 0;
        }
        return msg.content.length > 0;
      });

    // If no valid messages, return 0
    if (validMessages.length === 0) {
      return 0;
    }

    const claudeMessages = convertToClaudeMessages(validMessages);

    try {
      const response = await anthropic.messages.countTokens({
        model: process.env.ANTHROPIC_MODEL || FALLBACK_MODEL,
        messages: claudeMessages,
      });

      return response.input_tokens;
    } catch (error) {
      // Log the error for debugging
      await logger.error('Token counting API error', {
        error: error instanceof Error ? error.message : String(error),
        messageCount: validMessages.length,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Fallback to character-based estimation if API call fails
      const totalChars = validMessages.reduce(
        (sum, msg) =>
          sum +
          (typeof msg.content === 'string'
            ? msg.content.length
            : msg.content.reduce((s, block) => s + (block.text?.length || 0), 0)),
        0
      );

      const estimatedTokens = Math.ceil(totalChars / 4);
      await logger.warn('Using fallback token estimation', {
        totalChars,
        estimatedTokens,
        messageCount: validMessages.length,
      });

      return estimatedTokens;
    }
  };

  /**
   * Checks if this provider supports tool calling.
   *
   * @returns {boolean} Always true for Claude provider
   *
   * @remarks
   * All supported Claude models in this implementation have tool use capabilities.
   */
  const supportsToolCalling = (): boolean => {
    return true;
  };

  /**
   * Gets the provider type identifier.
   *
   * @returns {ProviderType} The provider type ('anthropic')
   *
   * @remarks
   * This method allows consumers to detect which provider implementation they're using
   * when necessary, although most code should be provider-agnostic.
   */
  const getProviderType = (): ProviderType => {
    return 'anthropic';
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
