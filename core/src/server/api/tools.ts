import { AgentServer } from '../agent-server.js';
import { ToolResultRequest } from '../types.js';

/**
 * Type definition for tool result response
 */
export type ToolResultResponse = {
  success: boolean;
};

/**
 * Type definition for tool result handler
 */
export type ToolResultHandler = {
  handleToolResult: (
    request: ToolResultRequest,
    agentServer: AgentServer
  ) => Promise<ToolResultResponse>;
};

/**
 * Creates a tool result handler for processing tool execution results
 */
export const createToolResultHandler = (): ToolResultHandler => {
  /**
   * Handles a tool result request
   */
  const handleToolResult = async (
    request: ToolResultRequest,
    agentServer: AgentServer
  ): Promise<ToolResultResponse> => {
    const { conversationId, requestId, result, error } = request;

    // Forward the result to the agent
    const success = await agentServer.handleToolResult(conversationId, requestId, result, error);

    return { success };
  };

  return {
    handleToolResult,
  };
};

/**
 * Default tool result handler instance
 */
export const toolResultHandler = createToolResultHandler();
