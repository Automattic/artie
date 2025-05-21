import { v4 as uuidv4 } from 'uuid';
import { AgentServer } from '../agent-server.js';
import { QueryRequest } from '../types.js';
import { Provider } from '../../provider/types.js';
import { createProvider } from '../../provider/createProvider.js';
import { AgentServerConfig } from '../types.js';

/**
 * Type definition for query response
 */
export type QueryResponse = {
  conversationId: string;
};

/**
 * Type definition for query handler
 */
export type QueryHandler = {
  handleQuery: (request: QueryRequest, agentServer: AgentServer) => Promise<QueryResponse>;
  createProvider: (providerName: string, config: AgentServerConfig) => Provider;
};

/**
 * Creates a query handler for processing user queries
 */
export const createQueryHandler = (): QueryHandler => {
  /**
   * Creates a provider instance based on the provider name
   */
  const createProviderInstance = (_providerName: string, _config: AgentServerConfig): Provider => {
    return createProvider();
  };

  /**
   * Handles a user query request
   */
  const handleQuery = async (
    request: QueryRequest,
    agentServer: AgentServer
  ): Promise<QueryResponse> => {
    const { query, context = {} } = request;
    const conversationId = request.conversationId || uuidv4();

    // Add systemPrompt to the context for the agent
    const updatedContext = {
      ...context,
    };

    // Process query through agent server with updated context
    await agentServer.processQuery(conversationId, query, updatedContext);

    return { conversationId };
  };

  return {
    handleQuery,
    createProvider: createProviderInstance,
  };
};
