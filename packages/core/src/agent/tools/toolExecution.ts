/**
 * @fileoverview Handles the execution of individual tool requests, including parameter validation,
 * error handling, and prevention of repeated failed attempts. This module is responsible for
 * the actual interaction with tools through the MCP client.
 */

import { randomUUID } from 'crypto';
import { Message, QueuedToolRequest } from '../types.js';
import { Tool } from '../../mcp/index.js';
import { Logger } from '../../utils/logger/index.js';
import { MCPClient } from '../../mcp/index.js';

/**
 * Executes a tool request and yields result messages.
 * @param {QueuedToolRequest} request - The tool request to execute
 * @param {Tool[]} tools - Available tools that can be used
 * @param {Message[]} messages - Current conversation history
 * @param {Record<string, Set<string>>} failedToolAttempts - Record of previously failed tool attempts
 * @param {MCPClient} mcpClient - Client for executing tools
 * @param {Logger} logger - Logger instance for debugging
 * @param {(message: Message) => void} addMessage - Function to add or update messages in history
 * @yields {Message} Messages generated during execution
 * @remarks
 * This function handles the complete tool execution process:
 * 1. Prevents repeated failed attempts with the same parameters
 * 2. Validates and extracts required parameters
 * 3. Attempts to fill missing parameters from context
 * 4. Executes the tool via MCP client
 * 5. Formats and yields response messages
 *
 * Special features:
 * - URL parameter extraction from assistant messages
 * - Tracking of failed attempts to prevent loops
 * - Detailed error reporting and logging
 * - Parameter validation against tool schemas
 */
export const executeToolRequest = async function* (
  request: QueuedToolRequest,
  tools: Tool[],
  messages: Message[],
  failedToolAttempts: Record<string, Set<string>>,
  mcpClient: MCPClient,
  logger: Logger,
  addMessage: (message: Message) => void
): AsyncGenerator<Message, void, unknown> {
  const toolName = request.tool;
  let toolParams = request.parameters || {};

  // Check if this exact tool call has failed before
  const paramsKey = JSON.stringify(toolParams);
  const failedSet = failedToolAttempts[toolName] || new Set<string>();
  const hasFailedBefore = failedSet.has(paramsKey);

  if (hasFailedBefore) {
    // Create a message to inform the model not to retry
    const preventRetryMessage: Message = {
      id: randomUUID(),
      role: 'user',
      type: 'text',
      content: `Tool ${toolName} was already attempted with these parameters and failed previously. Please try a different approach or parameters.`,
      createdAt: new Date().toISOString(),
      isComplete: true,
    };

    addMessage(preventRetryMessage);
    yield preventRetryMessage;
    return;
  }

  // Parameter validation and extraction
  const toolDef = tools.find((t) => t.name === toolName);

  if (toolDef?.input_schema) {
    const schema = toolDef.input_schema as {
      properties: Record<string, unknown>;
      required: string[];
    };

    // Check for missing parameters that might be mentioned in assistant messages
    const missingParams = schema.required.filter((param) => !(param in toolParams));

    if (missingParams.length > 0) {
      // Get text from all assistant messages in this conversation
      const assistantContent = messages
        .filter((m) => m.role === 'assistant' && m.type === 'text')
        .map((m) => m.content || '')
        .join(' ');

      // Special handling for URL parameters
      if (missingParams.includes('url')) {
        // Try to extract URLs from assistant messages
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = assistantContent.match(urlRegex);

        if (urls && urls.length > 0) {
          // Use the last URL mentioned by the assistant
          const extractedUrl = urls[urls.length - 1];
          toolParams = { ...toolParams, url: extractedUrl };
        }
      }

      // Re-check for missing params after extraction attempts
      const stillMissingParams = schema.required.filter((param) => !(param in toolParams));

      if (stillMissingParams.length > 0) {
        const errorMsg = `Missing required parameters for tool ${toolName}: ${stillMissingParams.join(', ')}`;
        await logger.error(errorMsg);
        throw new Error(errorMsg);
      }
    }
  }

  try {
    const result = await mcpClient.executeTool(toolName, toolParams);

    // Create a tool response message with the raw result
    const toolResponse: Message = {
      id: randomUUID(),
      role: 'user',
      type: 'tool_response',
      tool: toolName,
      content: result.isError ? undefined : (result.content as string),
      error: result.isError ? result.error : undefined,
      createdAt: new Date().toISOString(),
      isComplete: true,
    };

    // Check for problematic response formats - handle any tool, not just fetch
    if (typeof result.content === 'object' && result.content !== null) {
      try {
        // Try to safely stringify the object
        toolResponse.content = JSON.stringify(result.content, null, 2);
      } catch (err) {
        await logger.warn('Failed to stringify object response from tool', {
          toolName,
          error: err instanceof Error ? err.message : String(err),
        });
        toolResponse.error = 'Invalid response format - could not process tool output';
        toolResponse.content = undefined;
      }
    } else if (typeof result.content === 'string' && result.content.includes('[object')) {
      await logger.warn('Received likely unstringified object from tool', {
        toolName,
        content: result.content,
      });

      toolResponse.error = 'Invalid response format - improper object serialization';
      toolResponse.content = undefined;
    }

    addMessage(toolResponse);
    yield toolResponse;

    // Track failed tool attempts to prevent loops
    if (result.isError || result.content === null || result.content === undefined) {
      failedToolAttempts[toolName] = failedToolAttempts[toolName] || new Set<string>();
      failedToolAttempts[toolName].add(paramsKey);
    }
  } catch (error) {
    // Track the failed attempt
    failedToolAttempts[toolName] = failedToolAttempts[toolName] || new Set<string>();
    failedToolAttempts[toolName].add(paramsKey);

    const toolResponse: Message = {
      id: randomUUID(),
      role: 'user',
      type: 'tool_response',
      tool: toolName,
      error: error instanceof Error ? error.message : 'Unknown error',
      createdAt: new Date().toISOString(),
      isComplete: true,
    };

    addMessage(toolResponse);
    yield toolResponse;

    throw error; // Rethrow to be handled by the caller
  }
};
