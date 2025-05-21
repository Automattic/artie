/**
 * @fileoverview Creates and manages an agent that can process queries, execute tools, and maintain conversation state.
 * The agent acts as the orchestrator between the language model provider and MCP client tools.
 */

import { randomUUID } from 'crypto';
import { Agent, AgentConfig, Message, QueuedToolRequest } from './types.js';
import { createFileLogger, type Logger } from '../utils/logger/index.js';
import { parseBooleanEnv } from '../utils/env.js';
import { createUserMessage, createErrorMessage } from './provider/messages.js';
import { processInitialQuery } from './provider/providerInteraction.js';
import { processToolQueue } from './tools/toolQueue.js';
import { extractToolCallFromTextResponse, getSystemPrompt } from './utils.js';
import { containsFinalAnswerTag } from '../provider/utils.js';
import type { ProviderMessage } from '../provider/types.js';
import { getHumanReadableToolCall } from '../tasks/humanReadableToolCall.js';

/**
 * Convert Message to ProviderMessage
 */
const toProviderMessage = (message: Message): ProviderMessage => ({
  role: message.role,
  content: message.content || '',
});

/**
 * Creates a new agent instance with message handling and tool execution capabilities.
 * @param {AgentConfig} config - Configuration object containing provider and MCP client
 * @returns {Promise<Agent>} A new agent instance
 * @remarks
 * The agent serves as the central coordinator for:
 * 1. Managing conversation state and message history
 * 2. Processing user queries through the language model
 * 3. Executing tool requests in a controlled chain
 * 4. Preventing infinite loops and handling errors
 * 5. Maintaining system prompts and conversation context
 */
export const createAgent = async ({ provider, mcpClient }: AgentConfig): Promise<Agent> => {
  const logger: Logger = createFileLogger();

  let messages: Message[] = [];

  // Track failed tool attempts to prevent repeated calls
  const failedToolAttempts: Record<string, Set<string>> = {};

  // Queue for pending tool requests
  const toolRequestQueue: QueuedToolRequest[] = [];

  // Track pending tool responses
  const pendingToolRequests = new Set<string>();

  // Maximum chain length to prevent infinite loops
  const MAX_TOOL_CHAIN_LENGTH = 20;

  const systemPrompt = await getSystemPrompt();

  // Initialize with system prompt
  messages = [
    {
      id: randomUUID(),
      role: 'system',
      type: 'text',
      content: systemPrompt,
      createdAt: new Date().toISOString(),
      isComplete: true,
    },
  ];

  /**
   * Adds a new message to the conversation history or updates an existing one.
   * @param {Message} message - The message to add or update
   * @private
   * @remarks
   * Messages are always added to in-memory state.
   */
  const addMessage = async (message: Message): Promise<void> => {
    try {
      // Find if message with this ID already exists
      const existingIndex = messages.findIndex((msg) => msg.id === message.id);

      // Update in-memory state
      if (existingIndex >= 0) {
        messages[existingIndex] = message;
      } else {
        messages.push(message);
      }
    } catch (error) {
      await logger.error('Message operation failed:', {
        message,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /**
   * Returns a copy of the current message history.
   * @returns {Message[]} Array of all messages in the conversation
   * @remarks
   * Returns a new array to prevent external modification of the internal message state.
   */
  const getMessages = (): Message[] => {
    return [...messages];
  };

  /**
   * Clears all message history from the agent.
   * @remarks
   * This resets the conversation state but maintains the current system prompt.
   */
  const clearHistory = (): void => {
    const systemMessage = messages.find((msg) => msg.role === 'system');
    messages = systemMessage ? [systemMessage] : [];
  };

  /**
   * Adds a tool request to the execution queue.
   * @param {string} toolName - Name of the tool to execute
   * @param {Record<string, unknown>} parameters - Parameters for the tool execution
   * @private
   * @remarks
   * Tool requests are processed in order during query processing.
   * Each request is assigned a unique ID for tracking and error handling.
   */
  const enqueueToolRequest = async (
    toolName: string,
    parameters: Record<string, unknown> = {}
  ): Promise<void> => {
    const request: QueuedToolRequest = {
      id: randomUUID(),
      tool: toolName,
      parameters,
    };

    toolRequestQueue.push(request);
  };

  /**
   * Registers a tool request as pending to track its completion
   * @param {string} requestId - ID of the tool request
   * @private
   */
  const registerPendingRequest = (requestId: string): void => {
    pendingToolRequests.add(requestId);
  };

  /**
   * Marks a tool request as completed
   * @param {string} requestId - ID of the tool request
   * @private
   */
  const completePendingRequest = (requestId: string): void => {
    pendingToolRequests.delete(requestId);
  };

  /**
   * Waits for all pending tool requests to complete
   * @param {number} timeout - Maximum time to wait in milliseconds
   * @private
   */
  const waitForPendingRequests = async (timeout = 5000): Promise<void> => {
    if (pendingToolRequests.size === 0) return;

    const startTime = Date.now();

    while (pendingToolRequests.size > 0) {
      if (Date.now() - startTime > timeout) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  /**
   * Processes a user query through the agent, executing tools as needed.
   * @param {string} query - The user's input query
   * @param {Record<string, any>} [context] - Additional context for the query
   * @param {AbortSignal} [signal] - Abort signal for cancelling the query
   * @yields {Message} Messages generated during processing
   * @remarks
   * This is the main processing function that:
   * 1. Initializes the conversation with system prompt if needed
   * 2. Processes the initial query through the language model
   * 3. Executes any requested tools in a controlled chain
   * 4. Prevents infinite loops by limiting chain length
   * 5. Handles errors and provides appropriate feedback
   *
   * The function yields messages as they are generated, allowing for
   * real-time updates and streaming responses to the user.
   */
  const processQuery = async function* (
    query: string,
    context?: Record<string, any>,
    signal?: AbortSignal
  ): AsyncGenerator<Message, void, unknown> {
    // Get available tools first since we need them for the system prompt
    const tools = mcpClient.getTools();

    // Add user query
    const userMessage = createUserMessage(query);
    await addMessage(userMessage);
    yield userMessage;

    try {
      // Process the query with current messages
      // --- Initialize loop control variables ---
      let containsFinalAnswer = false;
      let toolChainCount = 0;

      // Initial provider call
      for await (const message of processInitialQuery(
        messages,
        tools,
        provider,
        addMessage,
        enqueueToolRequest,
        signal
      )) {
        yield message;
      }

      // Use a flag to control loop continuation based on fallback
      let continueLoop = true;
      while (toolChainCount < MAX_TOOL_CHAIN_LENGTH && continueLoop) {
        // Reset continue flag for this iteration, only set if fallback succeeds
        continueLoop = false;

        // Check primary exit conditions first
        if (containsFinalAnswer) {
          await logger.info('Final answer tag detected, ending tool loop.');
          break;
        }
        if (toolChainCount >= MAX_TOOL_CHAIN_LENGTH) {
          await logger.warn('Max tool chain length reached, ending loop.');
          const maxTokensMessage = createErrorMessage(
            new Error('Agent reached maximum interaction limit.'),
            null
          );
          addMessage(maxTokensMessage);
          yield maxTokensMessage;
          break;
        }

        // If queue has items, process it
        if (toolRequestQueue.length > 0) {
          toolChainCount++;
          await logger.info(
            `Starting tool processing iteration ${toolChainCount} (Queue Size: ${toolRequestQueue.length})`
          );
          for await (const message of processToolQueue(
            tools,
            toolRequestQueue, // Pass the queue itself
            messages, // Pass current messages
            failedToolAttempts,
            provider,
            mcpClient,
            logger,
            addMessage,
            enqueueToolRequest,
            registerPendingRequest, // Pass tracker functions
            completePendingRequest,
            context, // Pass context
            signal
          )) {
            yield message;
            if (message.role === 'assistant' && message.isComplete) {
              // Check if the latest assistant message contains the final answer tag
              containsFinalAnswer = containsFinalAnswerTag(message.content || '');
            }
          }
          // After processing, if queue still has items or final answer found, loop should continue/end normally
          if (toolRequestQueue.length > 0 || containsFinalAnswer) {
            continueLoop = true;
          }
        }

        // --- Fallback: Check last message if queue is empty and no final answer ---
        if (!continueLoop && !containsFinalAnswer && toolRequestQueue.length === 0) {
          await logger.info(
            'Tool queue empty, checking last assistant message for text-based tool call fallback.'
          );
          const lastMessage = messages[messages.length - 1];
          if (lastMessage?.role === 'assistant' && lastMessage.content) {
            const extractedCall = extractToolCallFromTextResponse(lastMessage.content);
            if (extractedCall) {
              await logger.info('Fallback successful: Enqueuing tool call extracted from text.');

              // --- Generate and Yield UI Event ---
              const uiRequestId = randomUUID();
              const description = await getHumanReadableToolCall(
                extractedCall.tool,
                extractedCall.parameters
              );
              const fallbackToolMessage: Message = {
                id: uiRequestId, // Separate ID for UI event
                role: 'assistant',
                type: 'tool_request',
                tool: extractedCall.tool,
                parameters: extractedCall.parameters,
                content: description || `Using tool: ${extractedCall.tool}...`, // Display text
                createdAt: new Date().toISOString(),
                toolMetadata: { description }, // Metadata for potential future use
              };
              yield fallbackToolMessage;
              // --- End Generate and Yield ---

              // Enqueue for server-side execution (uses its own internal ID)
              await enqueueToolRequest(extractedCall.tool, extractedCall.parameters);

              // Set flag to true so the while loop continues for another iteration
              continueLoop = true;
            } else {
              await logger.info('Fallback failed: No valid tool call found in last message text.');
            }
          } else {
            await logger.info(
              'Fallback skipped: Last message not from assistant or has no content.'
            );
          }
        }

        // If continueLoop is still false here, all conditions failed, exit the while loop
        if (!continueLoop) {
          await logger.info(
            'No further actions queued or extracted, ending agent processing loop.'
          );
        }
      }
      // --- End Main Tool Processing Loop ---

      // Wait for any pending tool requests to complete before exiting
      await waitForPendingRequests();
    } catch (error) {
      await logger.error('PROCESS QUERY ERROR: Query processing failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const errorMessage = createErrorMessage(error);
      await addMessage(errorMessage);
      yield errorMessage;
    }
  };

  // Return the agent interface
  const agent: Agent = {
    processQuery,
    getMessages,
    clearHistory,
    mcpClient,
    provider,
    async getContextUsage(messages: Message[]) {
      const providerMessages = messages.map(toProviderMessage);
      return provider.getContextUsage(providerMessages);
    },
  };

  return agent;
};
