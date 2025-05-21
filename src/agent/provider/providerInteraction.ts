/**
 * @fileoverview Handles interactions between the agent and the language model provider.
 * Manages the flow of messages, tool requests, and responses in the conversation.
 */

import { Tool, JSONSchemaProperty } from '../../mcp/types/tool.js';
import { Message, ToolMetadata } from '../types.js';
import { Logger } from '../../utils/logger/index.js';
import {
  Provider,
  ToolDefinition,
  ToolParameterProperty,
  ProviderMessage,
} from '../../provider/types.js';
import { convertToProviderMessages, createMessageFromResponse } from './messages.js';
import { getHumanReadableToolCall } from '../../tasks/humanReadableToolCall.js';

/**
 * Convert JSONSchemaProperty to ToolParameterProperty
 */
const convertSchemaProperty = (prop: JSONSchemaProperty): ToolParameterProperty => ({
  type: prop.type || 'string',
  description: prop.description,
  enum: prop.enum?.map(String),
  items: prop.items as Record<string, unknown>,
});

/**
 * Convert MCP Tool to Provider ToolDefinition
 */
const convertToToolDefinition = (tool: Tool): ToolDefinition => ({
  name: tool.name,
  description: tool.description,
  parameters: {
    type: 'object',
    properties:
      typeof tool.input_schema === 'object' &&
      tool.input_schema &&
      'properties' in tool.input_schema
        ? Object.entries(tool.input_schema.properties || {}).reduce(
            (acc, [key, value]) => ({
              ...acc,
              [key]: convertSchemaProperty(value as JSONSchemaProperty),
            }),
            {} as Record<string, ToolParameterProperty>
          )
        : {},
    required:
      typeof tool.input_schema === 'object' && tool.input_schema && 'required' in tool.input_schema
        ? (tool.input_schema.required as string[])
        : [],
  },
});

/**
 * Process the initial user query and get the first response from the provider.
 * @param {Message[]} messages - Current conversation history
 * @param {Tool[]} tools - Available tools that can be used by the provider
 * @param {Provider} provider - Language model provider instance
 * @param {(message: Message) => void} addMessage - Function to add or update messages in history
 * @param {(toolName: string, parameters: Record<string, unknown>) => void} enqueueToolRequest - Function to queue tool requests
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @yields {Message} Messages generated during processing
 * @remarks
 * This function:
 * 1. Converts internal message format to provider-compatible format
 * 2. Initiates conversation with the provider
 * 3. Processes responses and enqueues any tool requests
 * 4. Stops processing when a tool request is received to allow tool execution
 */
export const processInitialQuery = async function* (
  messages: Message[],
  tools: Tool[],
  provider: Provider,
  addMessage: (message: Message) => void,
  enqueueToolRequest: (toolName: string, parameters: Record<string, unknown>) => void,
  signal?: AbortSignal
): AsyncGenerator<Message, void, unknown> {
  // Log conversation history before starting provider
  const providerMessages = convertToProviderMessages(messages);

  // Convert tools to provider format and pass as options
  const toolDefinitions = tools.map(convertToToolDefinition);

  // Track current streaming message
  let currentMessage: Message | null = null;

  // Process through provider
  for await (const response of provider.complete(providerMessages, {
    tools: toolDefinitions,
    signal,
  })) {
    // Handle different response types
    if (response.type === 'text') {
      if (currentMessage) {
        // Update the existing message with the new content but keep its ID
        const updatedMessage = {
          ...currentMessage,
          content: response.content,
          isComplete: response.isComplete,
        };

        // Important: Use the same message ID here for consistency
        addMessage(updatedMessage);

        // Yield the updated message for the stream
        yield updatedMessage;
      } else {
        // First chunk of a text response, create a new message and store it
        currentMessage = {
          ...createMessageFromResponse(response),
          isComplete: response.isComplete,
        };
        addMessage(currentMessage);
        yield currentMessage;
      }
    } else if (response.type === 'tool_request' && response.tool) {
      // Get human-readable description for the tool request
      const description = await getHumanReadableToolCall(response.tool, response.parameters || {});

      // Create the message with proper metadata
      const message = createMessageFromResponse(response);
      message.toolMetadata = {
        description,
      } as ToolMetadata;

      // Add to history and yield the message with metadata
      addMessage(message);
      yield message;

      // Reset current message tracking
      currentMessage = null;

      // Add to queue for execution
      await enqueueToolRequest(response.tool, response.parameters || {});

      // Stop processing initial query since we have a tool request
      // We'll handle it in the tool queue processing phase
      break;
    } else {
      // For other non-text messages, handle normally
      const message = createMessageFromResponse(response);
      addMessage(message);
      yield message;

      // Reset current message tracking
      currentMessage = null;
    }
  }
};

/**
 * Gets a continuation response after tool execution to maintain conversation flow.
 * @param {Message[]} messages - Updated conversation history including tool results
 * @param {Tool[]} tools - Available tools that can be used by the provider
 * @param {Provider} provider - Language model provider instance
 * @param {(message: Message) => void} addMessage - Function to add or update messages in history
 * @param {(toolName: string, parameters: Record<string, unknown>) => void} enqueueToolRequest - Function to queue tool requests
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @yields {Message} Messages generated during processing
 * @remarks
 * This function:
 * 1. Creates a new provider session with updated history including tool results
 * 2. Continues the conversation flow with the provider
 * 3. Processes any new tool requests that may arise
 * 4. Maintains conversation coherence after tool execution
 *
 * The function breaks processing when a new tool request is received,
 * allowing the main processing loop to handle tool execution in sequence.
 */
export const getContinuationResponse = async function* (
  messages: Message[],
  tools: Tool[],
  provider: Provider,
  addMessage: (message: Message) => void,
  enqueueToolRequest: (toolName: string, parameters: Record<string, unknown>) => void,
  signal?: AbortSignal
): AsyncGenerator<Message, void, unknown> {
  // Log conversation history before starting provider
  const providerMessages = convertToProviderMessages(messages);

  // Convert tools to provider format and pass as options
  const toolDefinitions = tools.map(convertToToolDefinition);

  // Track current streaming message
  let currentMessage: Message | null = null;

  // Process through provider
  for await (const response of provider.complete(providerMessages, {
    tools: toolDefinitions,
    signal,
  })) {
    // Handle different response types
    if (response.type === 'text') {
      if (currentMessage) {
        // Update the existing message with the new content but keep its ID
        const updatedMessage = {
          ...currentMessage,
          content: response.content,
          isComplete: response.isComplete,
        };

        // Important: Use the same message ID here for consistency
        addMessage(updatedMessage);

        // Yield the updated message for the stream
        yield updatedMessage;
      } else {
        // First chunk of a text response, create a new message and store it
        currentMessage = {
          ...createMessageFromResponse(response),
          isComplete: response.isComplete,
        };
        addMessage(currentMessage);
        yield currentMessage;
      }
    } else if (response.type === 'tool_request' && response.tool) {
      // Get human-readable description for the tool request
      const description = await getHumanReadableToolCall(response.tool, response.parameters || {});

      // Create the message with proper metadata
      const message = createMessageFromResponse(response);
      message.toolMetadata = {
        description,
      } as ToolMetadata;

      // Add to history and yield the message with metadata
      addMessage(message);
      yield message;

      // Reset current message tracking
      currentMessage = null;

      // Add to queue for execution
      await enqueueToolRequest(response.tool, response.parameters || {});

      // Stop processing continuation since we have a tool request
      // We'll handle it in the tool queue processing phase
      break;
    } else {
      // For other non-text messages, handle normally
      const message = createMessageFromResponse(response);
      addMessage(message);
      yield message;

      // Reset current message tracking
      currentMessage = null;
    }
  }
};
