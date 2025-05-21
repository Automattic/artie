import { AgentServer } from '../agent-server.js';
import { SSEConnection } from '../types.js';

/**
 * Type definition for stream handler
 */
export type StreamHandler = {
  setupStream: (
    conversationId: string,
    connection: SSEConnection,
    agentServer: AgentServer
  ) => void;
  closeStream: (conversationId: string, agentServer: AgentServer) => void;
};

/**
 * Creates a stream handler for managing SSE connections
 */
export const createStreamHandler = (): StreamHandler => {
  /**
   * Sets up an SSE stream for a conversation
   */
  const setupStream = (
    conversationId: string,
    connection: SSEConnection,
    agentServer: AgentServer
  ): void => {
    // Register the connection with the agent server
    agentServer.registerStream(conversationId, connection);

    // Send an initial connected event
    connection.send('connected', { conversationId });
  };

  /**
   * Closes an SSE stream for a conversation
   */
  const closeStream = (conversationId: string, agentServer: AgentServer): void => {
    // Remove the connection from the agent server
    agentServer.removeStream(conversationId);
  };

  return {
    setupStream,
    closeStream,
  };
};

/**
 * Default stream handler instance
 */
export const streamHandler = createStreamHandler();
