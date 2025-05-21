/**
 * @fileoverview Manages the processing of queued tool requests in sequence,
 * handling tool execution and continuation responses from the provider.
 * This module orchestrates the flow between tool execution and provider responses.
 */

import { Tool } from '../../mcp/types/tool.js';
import { Message, QueuedToolRequest } from '../types.js';
import { Logger } from '../../utils/logger/index.js';
import { createErrorMessage } from '../provider/messages.js';
import { executeToolRequest } from './toolExecution.js';
import { getContinuationResponse } from '../provider/providerInteraction.js';
import { Provider } from '../../provider/types.js';
import { MCPClient } from '../../mcp/index.js';

/**
 * Processes the tool request queue until empty, handling each request in sequence.
 * @param {Tool[]} tools - Available tools that can be used
 * @param {QueuedToolRequest[]} toolRequestQueue - Queue of pending tool requests
 * @param {Message[]} messages - Current conversation history
 * @param {Record<string, Set<string>>} failedToolAttempts - Record of previously failed tool attempts
 * @param {Provider} provider - Language model provider instance
 * @param {MCPClient} mcpClient - Client for executing tools
 * @param {Logger} logger - Logger instance for debugging
 * @param {(message: Message) => void} addMessage - Function to add or update messages in history
 * @param {(toolName: string, parameters: Record<string, unknown>) => void} enqueueToolRequest - Function to queue new tool requests
 * @param {(requestId: string) => void} registerPendingRequest - Function to register a pending request
 * @param {(requestId: string) => void} completePendingRequest - Function to mark a request as completed
 * @param {Record<string, any>} context - Additional context for the operation
 * @param {AbortSignal} signal - Abort signal for cancelling the operation
 * @yields {Message} Messages generated during processing
 * @remarks
 * This function manages the tool execution workflow:
 * 1. Processes one tool request at a time from the queue
 * 2. Executes each tool and handles its response
 * 3. Gets continuation responses from the provider
 * 4. Handles errors while maintaining queue processing
 *
 * Key features:
 * - Sequential tool execution
 * - Error isolation (errors in one tool don't stop queue processing)
 * - Continuation handling after each tool execution
 * - Support for provider-initiated tool chaining
 */
export const processToolQueue = async function* (
  tools: Tool[],
  toolRequestQueue: QueuedToolRequest[],
  messages: Message[],
  failedToolAttempts: Record<string, Set<string>>,
  provider: Provider,
  mcpClient: MCPClient,
  logger: Logger,
  addMessage: (message: Message) => void,
  enqueueToolRequest: (toolName: string, parameters: Record<string, unknown>) => void,
  registerPendingRequest?: (requestId: string) => void,
  completePendingRequest?: (requestId: string) => void,
  context?: Record<string, any>,
  signal?: AbortSignal
): AsyncGenerator<Message, void, unknown> {
  if (toolRequestQueue.length === 0) {
    return;
  }

  // Get the next request from the queue
  const request = toolRequestQueue.shift()!;

  try {
    // Register this tool request as pending if tracking is enabled
    if (registerPendingRequest) {
      registerPendingRequest(request.id);
    }

    // Process this tool request
    for await (const message of executeToolRequest(
      request,
      tools,
      messages,
      failedToolAttempts,
      mcpClient,
      logger,
      addMessage
    )) {
      yield message;
    }

    // Get continuation response after tool execution
    for await (const message of getContinuationResponse(
      messages,
      tools,
      provider,
      addMessage,
      enqueueToolRequest,
      signal
    )) {
      yield message;
    }

    // Mark this tool request as completed if tracking is enabled
    if (completePendingRequest) {
      completePendingRequest(request.id);
    }
  } catch (error) {
    await logger.error('TOOL QUEUE ERROR: Failed to process tool request', {
      error: error instanceof Error ? error.message : String(error),
      toolName: request.tool,
      requestId: request.id,
    });

    // Mark request as completed even if it failed
    if (completePendingRequest) {
      completePendingRequest(request.id);
    }

    // Handle execution error, but continue processing queue
    const errorMessage = createErrorMessage(error, request);
    addMessage(errorMessage);
    yield errorMessage;
  }
};
