import { SSEConnection, ToolRequest } from '../types.js';
import { Message } from '../../agent/types.js';

type StreamState = {
  connections: Map<string, SSEConnection>;
  messageContents: Map<string, string>;
  buffers: Map<string, string>; // Buffer for each message
  partialTagDetected: Map<string, boolean>; // Track if we've seen a partial tag
};

export type StreamManager = {
  registerConnection: (connection: SSEConnection) => void;
  removeConnection: (id: string) => void;
  sendMessage: (connectionId: string, message: Message) => boolean;
  updateMessage: (connectionId: string, messageId: string, updates: Partial<Message>) => boolean;
  sendToolRequest: (connectionId: string, toolRequest: ToolRequest) => boolean;
  sendError: (connectionId: string, error: string) => boolean;
  sendComplete: (connectionId: string) => boolean;
  getConnectionCount: () => number;
};

// Helper to detect and handle potential partial tool call tags across multiple chunks
const detectPartialTag = (content: string): boolean => {
  // Check for partial tool_call openings at the end of a chunk
  const partialOpeners = [
    '<t',
    '<to',
    '<too',
    '<tool',
    '<tool_',
    '<tool_c',
    '<tool_ca',
    '<tool_cal',
  ];
  for (const partial of partialOpeners) {
    if (content.endsWith(partial)) {
      return true;
    }
  }
  return false;
};

export const createStreamManager = (): StreamManager => {
  // Internal state
  const state: StreamState = {
    connections: new Map(),
    messageContents: new Map(),
    buffers: new Map(),
    partialTagDetected: new Map(),
  };

  // Helper function to get connection
  const getConnection = (connectionId: string): SSEConnection | undefined =>
    state.connections.get(connectionId);

  const registerConnection = (connection: SSEConnection): void => {
    state.connections.set(connection.id, connection);
  };

  const removeConnection = (id: string): void => {
    state.connections.delete(id);
    // Also clean up any buffers for this connection
    for (const [messageId, _] of state.buffers) {
      if (messageId.startsWith(id)) {
        state.buffers.delete(messageId);
      }
    }
    // Clean up partial tag tracking
    for (const [messageId, _] of state.partialTagDetected) {
      if (messageId.startsWith(id)) {
        state.partialTagDetected.delete(messageId);
      }
    }
  };

  // Remove tool call tags from content
  const sanitizeContent = (content: string): string => {
    // First try the precise regex
    let sanitized = content.replace(
      /<tool_call\s+tool="[\w_\-]+"\s+parameters=(?:"|')({.*?})(?:"|')\s*\/>/g,
      ''
    );

    // If no change, try a more aggressive approach
    if (sanitized === content && content.includes('<tool_call')) {
      sanitized = content.replace(/<tool_call.*?\/>/g, '');
    }

    // Clean up any empty lines created by tag removal
    sanitized = sanitized.replace(/\n\s*\n/g, '\n');
    sanitized = sanitized.replace(/^\s*\n/, '').replace(/\n\s*$/, '');

    return sanitized;
  };

  const sendMessage = (connectionId: string, message: Message): boolean => {
    const connection = getConnection(connectionId);
    if (!connection) return false;

    // Track content for text messages
    if (message.type === 'text' && message.content) {
      state.messageContents.set(message.id, message.content);

      // Initialize buffer for this message
      const bufferKey = `${connectionId}-${message.id}`;
      state.buffers.set(bufferKey, '');
      state.partialTagDetected.set(bufferKey, false);

      // Remove tool_call tags from initial message
      let sanitizedContent = message.content;

      if (message.content?.includes('<tool_call') || detectPartialTag(message.content || '')) {
        // Check for partial tags that might need buffering
        if (detectPartialTag(message.content || '')) {
          state.partialTagDetected.set(bufferKey, true);
          state.buffers.set(bufferKey, message.content || '');

          // Don't send anything yet, wait for more chunks
          return true;
        }

        sanitizedContent = sanitizeContent(message.content || '');
      }

      // Send sanitized message
      connection.send('message', {
        ...message,
        content: sanitizedContent,
      });
    } else {
      connection.send('message', message);
    }
    return true;
  };

  const updateMessage = (
    connectionId: string,
    messageId: string,
    updates: Partial<Message>
  ): boolean => {
    const connection = getConnection(connectionId);
    if (!connection) return false;

    // Handle content updates
    if (updates.content) {
      const existingContent = state.messageContents.get(messageId) || '';

      // Only send update if content has changed
      if (updates.content !== existingContent) {
        // Calculate the delta (new content that was added)
        let delta = '';
        if (updates.content.startsWith(existingContent)) {
          delta = updates.content.slice(existingContent.length);
        } else {
          // If somehow the content doesn't build on previous content,
          // fall back to sending the full content
          delta = updates.content;
        }

        // Update stored full content
        state.messageContents.set(messageId, updates.content);

        // Buffer key combines connection and message IDs to handle multiple clients
        const bufferKey = `${connectionId}-${messageId}`;

        // Get or initialize buffer and partial tag flag
        let buffer = state.buffers.get(bufferKey) || '';
        let wasPartialTagDetected = state.partialTagDetected.get(bufferKey) || false;

        // Add the new delta to our buffer
        buffer += delta;

        // Check if we had a partial tag or if this delta contains/completes a tag
        const hasToolCallStart = buffer.includes('<tool_call');
        const hasToolCallEnd = buffer.includes('/>');

        if (wasPartialTagDetected || hasToolCallStart || detectPartialTag(buffer)) {
          // Check if we should continue buffering
          let shouldContinueBuffering = false;

          // If we have a start tag but no end tag, continue buffering
          if (hasToolCallStart && !hasToolCallEnd) {
            shouldContinueBuffering = true;
          }

          // Also check for partial tags at the end
          if (detectPartialTag(buffer)) {
            shouldContinueBuffering = true;
          }

          // If we have both start and end tags or no reason to buffer, process and clear
          if (!shouldContinueBuffering) {
            // Sanitize the full buffer
            const sanitizedBuffer = sanitizeContent(buffer);

            if (sanitizedBuffer !== buffer) {
              buffer = sanitizedBuffer;
            }

            // Send the sanitized buffer if not empty
            if (buffer.length > 0) {
              connection.send('update_message', {
                id: messageId,
                updates: {
                  content: updates.content,
                  delta: buffer,
                  deltaType: 'append',
                },
              });
            }

            // Clear the buffer and reset flags
            buffer = '';
            state.partialTagDetected.set(bufferKey, false);
          } else {
            // Update the partial tag flag
            state.partialTagDetected.set(bufferKey, true);
          }
        } else {
          // No tool call detected, just send the content directly
          if (buffer.length > 0) {
            connection.send('update_message', {
              id: messageId,
              updates: {
                content: updates.content,
                delta: buffer,
                deltaType: 'append',
              },
            });
            buffer = '';
          }
        }

        // Safety check - if buffer is getting too large, force send it
        if (buffer.length > 2000) {
          const sanitizedBuffer = sanitizeContent(buffer);

          if (sanitizedBuffer.length > 0) {
            connection.send('update_message', {
              id: messageId,
              updates: {
                content: updates.content,
                delta: sanitizedBuffer,
                deltaType: 'append',
              },
            });
          }

          buffer = '';
          state.partialTagDetected.set(bufferKey, false);
        }

        // Update buffer
        state.buffers.set(bufferKey, buffer);
      }
    } else {
      connection.send('update_message', {
        id: messageId,
        updates,
      });
    }

    return true;
  };

  const sendToolRequest = (connectionId: string, toolRequest: ToolRequest): boolean => {
    const connection = getConnection(connectionId);
    if (!connection) return false;

    connection.send('tool_request', toolRequest);
    return true;
  };

  const sendError = (connectionId: string, error: string): boolean => {
    const connection = getConnection(connectionId);
    if (!connection) return false;

    connection.send('error', { error });
    return true;
  };

  const sendComplete = (connectionId: string): boolean => {
    const connection = getConnection(connectionId);
    if (!connection) return false;

    // Send any remaining buffered content before completing
    for (const [bufferKey, buffer] of state.buffers.entries()) {
      if (bufferKey.startsWith(`${connectionId}-`) && buffer.length > 0) {
        const messageId = bufferKey.substring(connectionId.length + 1);

        // Make one final attempt to sanitize the buffer
        const sanitizedBuffer = sanitizeContent(buffer);

        connection.send('update_message', {
          id: messageId,
          updates: {
            content: state.messageContents.get(messageId),
            delta: sanitizedBuffer,
            deltaType: 'append',
          },
        });
      }
    }

    // Clean up message tracking and buffers for this connection
    for (const bufferKey of state.buffers.keys()) {
      if (bufferKey.startsWith(`${connectionId}-`)) {
        state.buffers.delete(bufferKey);
      }
    }
    for (const tagKey of state.partialTagDetected.keys()) {
      if (tagKey.startsWith(`${connectionId}-`)) {
        state.partialTagDetected.delete(tagKey);
      }
    }

    connection.send('complete', {});
    connection.close();
    removeConnection(connectionId);
    return true;
  };

  const getConnectionCount = (): number => state.connections.size;

  return {
    registerConnection,
    removeConnection,
    sendMessage,
    updateMessage,
    sendToolRequest,
    sendError,
    sendComplete,
    getConnectionCount,
  };
};
