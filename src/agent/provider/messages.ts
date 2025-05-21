/**
 * @fileoverview Message handling utilities for the agent-provider interaction.
 * Provides functions for message conversion, creation, and formatting between
 * the agent's internal format and the provider's expected format.
 */

import { ProviderMessage } from '../../provider/types.js';
import { randomUUID } from 'crypto';
import { Message, QueuedToolRequest, AgentProviderResponse } from '../types.js';

/**
 * Converts internal message format to provider messages format.
 * @param {Message[]} msgs - Array of internal messages to convert
 * @returns {ProviderMessage[]} Array of messages in provider format
 * @remarks
 * This function:
 * 1. Converts tool responses to user messages for provider compatibility
 * 2. Formats tool responses with special markers for clarity
 * 3. Filters out empty messages and tool requests
 * 4. Maintains conversation flow with proper role assignments
 */
export const convertToProviderMessages = (msgs: Message[]): ProviderMessage[] => {
  const convertedMessages = msgs
    .map((msg) => {
      // Always convert tool responses to user messages
      const role = msg.type === 'tool_response' ? 'user' : msg.role;

      // Format the content based on message type
      let content = '';
      if (msg.type === 'text') {
        content = msg.content || '';
      } else if (msg.type === 'tool_response') {
        // Properly format tool responses for Claude to understand
        if (msg.error) {
          content = `[TOOL ERROR] Tool "${msg.tool}" execution failed: ${msg.error}`;
        } else {
          content = createFormattedResponse(msg.tool || 'unknown', msg.content);
        }
      } else {
        // Tool requests should be excluded from the conversation history
        // The proper API-based tool calls will be handled by the provider
        content = '';
      }

      return {
        role,
        content,
      };
    })
    .filter((msg) => msg.content.trim() !== ''); // Filter out empty messages

  return convertedMessages;
};

/**
 * Creates a message from a provider response.
 * @param {AgentProviderResponse} response - Response from the provider
 * @returns {Message} Formatted internal message
 * @remarks
 * Creates a new message with:
 * - Unique ID for tracking
 * - Assistant role assignment
 * - Timestamp for message ordering
 * - Preserved tool information if present
 */
export const createMessageFromResponse = (response: AgentProviderResponse): Message => {
  const message: Message = {
    id: randomUUID(),
    role: 'assistant',
    type: response.type,
    content: response.content,
    tool: response.tool,
    parameters: response.parameters,
    error: response.error,
    createdAt: new Date().toISOString(),
  };

  // Add tool metadata only for tool_request type
  if (response.type === 'tool_request' && response.toolMetadata) {
    message.toolMetadata = response.toolMetadata;
  }

  return message;
};

/**
 * Creates a user message.
 * @param {string} content - Message content
 * @returns {Message} Formatted user message
 * @remarks
 * Creates a standard text message with user role and timestamp.
 * User messages are always marked as complete since they don't stream.
 */
export const createUserMessage = (content: string): Message => {
  return {
    id: randomUUID(),
    role: 'user',
    type: 'text',
    content,
    createdAt: new Date().toISOString(),
    isComplete: true, // User messages are always complete when created
  };
};

/**
 * Creates a system message.
 * @param {string} content - Message content
 * @returns {Message} Formatted system message
 * @remarks
 * Creates a system message for configuration and control purposes.
 * System messages are always marked as complete since they don't stream.
 */
export const createSystemMessage = (content: string): Message => {
  return {
    id: randomUUID(),
    role: 'system',
    type: 'text',
    content,
    createdAt: new Date().toISOString(),
    isComplete: true, // System messages are always complete when created
  };
};

/**
 * Creates an error message.
 * @param {unknown} error - Error object or message
 * @param {QueuedToolRequest} [request] - Related tool request if applicable
 * @returns {Message} Formatted error message
 * @remarks
 * Creates a system message containing error information and optional
 * tool context for debugging purposes.
 * Error messages are always marked as complete since they don't stream.
 */
export const createErrorMessage = (error: unknown, request?: QueuedToolRequest): Message => {
  const errorContent = error instanceof Error ? error.message : 'Unknown error';
  const toolInfo = request ? ` with tool ${request.tool}` : '';

  return {
    id: randomUUID(),
    role: 'system',
    type: 'text',
    content: `Agent error${toolInfo}: ${errorContent}`,
    createdAt: new Date().toISOString(),
    isComplete: true, // Error messages are always complete when created
  };
};

/**
 * Creates a formatted response for tool results.
 * @param {string} toolName - Name of the tool that was executed
 * @param {unknown} content - Tool execution result
 * @returns {string} Formatted response string
 * @remarks
 * This function handles various result types:
 * 1. Null/undefined values with appropriate messaging
 * 2. Array responses with text content
 * 3. JSON string parsing for readability
 * 4. Object stringification with proper formatting
 *
 * Special cases include:
 * - Empty string results
 * - Unparseable content
 * - Complex nested objects
 */
export const createFormattedResponse = (toolName: string, content: unknown): string => {
  try {
    // Create a human-readable response with proper formatting
    if (content === null || content === undefined) {
      return `[TOOL RESULT] Tool "${toolName}" was executed but returned NULL/UNDEFINED. The URL may be unavailable or the resource doesn't exist. DO NOT retry this exact tool call with the same parameters - try a different approach.`;
    }

    // Handle array of objects with text content (common for fetch responses)
    if (
      Array.isArray(content) &&
      content.length > 0 &&
      typeof content[0] === 'object' &&
      content[0] !== null
    ) {
      if ('text' in content[0] && typeof content[0].text === 'string') {
        // Common pattern in fetch responses
        return `[TOOL RESULT] Tool "${toolName}" returned: ${content[0].text}`;
      }
    }

    if (typeof content === 'string') {
      // Handle empty strings
      if (content.trim() === '') {
        return `[TOOL RESULT] Tool "${toolName}" was executed successfully but returned an EMPTY STRING. The resource likely exists but has no content. DO NOT retry this exact tool call with the same parameters.`;
      }

      // Try to parse JSON strings to make them more readable
      try {
        const parsed = JSON.parse(content);
        return `[TOOL RESULT] Tool "${toolName}" returned: ${JSON.stringify(parsed, null, 2)}`;
      } catch {
        // If it's not JSON, just return the string
        return `[TOOL RESULT] Tool "${toolName}" returned: ${content}`;
      }
    }

    // For objects, arrays, etc.
    return `[TOOL RESULT] Tool "${toolName}" returned: ${JSON.stringify(content, null, 2)}`;
  } catch {
    // Default formatting for other tools or if special handling fails
    return `[TOOL RESULT] Tool "${toolName}" was executed and completed with an unprocessable result. DO NOT retry this exact tool call with the same parameters.`;
  }
};
