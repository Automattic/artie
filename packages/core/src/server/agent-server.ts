import { Agent } from '../agent/types.js';
import { createMCPClient, MCPServer } from '../mcp/index.js';
import { createAgent } from '../agent/index.js';
import { createProvider } from '../provider/index.js';
import { AgentServerConfig, SSEConnection, TokenUsage, ToolRequest } from './types.js';
import { createStreamManager } from './services/stream-manager.js';
import { createConversationService } from './services/conversation.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getHumanReadableToolCall } from '../tasks/humanReadableToolCall.js';

// Get current file's directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load environment variables from workspace root first, then fall back to core package
const rootEnvPath = path.resolve(__dirname, '../../../../.env');
const packageEnvPath = path.resolve(__dirname, '../../../.env');

// Check if root .env exists first
try {
  await fs.access(rootEnvPath);
  dotenv.config({ path: rootEnvPath });
} catch {
  // Fall back to package .env
  dotenv.config({ path: packageEnvPath });
}

/**
 * Extended Agent interface that includes the handleToolResult method
 * This will be added to the core Agent interface later
 */
export interface AgentWithToolResult extends Agent {
  handleToolResult?: (requestId: string, result: unknown, error?: string) => Promise<boolean>;
}

/**
 * Type definition for the AgentServer
 */
export type AgentServer = {
  processQuery: (
    conversationId: string,
    query: string,
    context: Record<string, unknown>,
    signal?: AbortSignal
  ) => Promise<string>;
  handleToolResult: (
    conversationId: string,
    requestId: string,
    result: unknown,
    error?: string
  ) => Promise<boolean>;
  registerStream: (conversationId: string, connection: SSEConnection) => void;
  removeStream: (conversationId: string) => void;
  getActiveConversationsCount: () => number;
  getContextUsage: (conversationId: string) => Promise<TokenUsage>;
  cancelRequest: (conversationId: string) => void;
};

/**
 * Creates an AgentServer instance to manage agents and handle streaming responses
 */
export const createAgentServer = (config: AgentServerConfig): AgentServer => {
  const streamManager = createStreamManager();
  const conversationService = createConversationService();

  // Store abort controllers for each conversation
  const abortControllers: Map<string, AbortController> = new Map();

  // Store pending tool requests for each conversation
  const pendingToolRequests: Map<string, { conversationId: string; tool: string }> = new Map();

  // Add a logger utility (optional, but good practice)
  const log = (
    level: 'info' | 'warn' | 'error',
    message: string,
    ...optionalParams: any[]
  ): void => {
    console[level](
      `[AgentServer] ${new Date().toISOString()} [${level.toUpperCase()}] ${message}`,
      ...optionalParams
    );
  };

  /**
   * Loads MCP server configurations from a JSON file
   */
  const loadMCPServers = async (): Promise<MCPServer[]> => {
    // If servers are provided in config, use those
    if (config.mcpServers) {
      return config.mcpServers;
    }

    try {
      const rootConfigPath = path.resolve(__dirname, '../../../../mcp-servers.json');
      const coreConfigPath = path.resolve(__dirname, '../../mcp-servers.json');

      // Then fallback to provided path or root path first, then core path
      const serversPath =
        config.mcpConfigPath ||
        (await fs
          .access(rootConfigPath)
          .then(() => rootConfigPath)
          .catch(() => coreConfigPath));

      // Check if file exists
      const exists = await fs
        .access(serversPath)
        .then(() => true)
        .catch(() => false);

      if (!exists) {
        console.warn(`MCP servers configuration file not found at: ${serversPath}`);
        return [];
      }

      // Read and parse configuration
      const serversContent = await fs.readFile(serversPath, 'utf-8');
      const data = JSON.parse(serversContent);

      // Handle new format with mcpServers as the root object
      const mcpServersConfig = data.mcpServers || {};

      // Convert the configuration to MCPServer array
      const allServers: MCPServer[] = Object.entries(mcpServersConfig).map(([name, config]) => {
        const serverConfig = config as {
          command: string;
          args: string[];
          type?: 'stdio' | 'sse';
          env?: Record<string, string>;
          serverUrl?: string;
        };

        return {
          name,
          type: serverConfig.type || 'stdio', // Default to stdio if type is omitted
          command: serverConfig.command,
          args: serverConfig.args,
          serverUrl: serverConfig.serverUrl,
          env: serverConfig.env,
        };
      });

      // Filter servers if names are provided
      if (config.mcpServerNames && config.mcpServerNames.length > 0) {
        const filteredServers = allServers.filter((server) =>
          config.mcpServerNames!.includes(server.name)
        );

        // Warn about any specified servers that weren't found
        const foundServerNames = new Set(filteredServers.map((s) => s.name));
        const missingServers = config.mcpServerNames.filter((name) => !foundServerNames.has(name));
        if (missingServers.length > 0) {
          console.warn(
            `The following servers were not found in the configuration: ${missingServers.join(
              ', '
            )}`
          );
        }

        return filteredServers;
      }

      return allServers;
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
      return [];
    }
  };

  /**
   * Creates or retrieves an agent for the given conversation
   */
  const getOrCreateAgent = async (conversationId: string): Promise<AgentWithToolResult> => {
    log('info', `Attempting to get or create agent for conversation: ${conversationId}`);
    // Check if conversation exists
    const conversation = conversationService.getConversation(conversationId);
    if (conversation) {
      log('info', `Found existing conversation for ${conversationId}, updating activity`);
      conversationService.updateActivity(conversationId);
      return conversation.agent as AgentWithToolResult;
    }

    log('info', `Creating new agent for conversation: ${conversationId}`);
    // Create provider and MCP client
    const provider = createProvider();
    const mcpClient = createMCPClient();

    try {
      // Load and connect to MCP servers
      log('info', 'Loading MCP server configurations...');
      const servers = await loadMCPServers();
      log('info', `Found ${servers.length} MCP servers to connect to`);

      // Connect to MCP servers
      log('info', 'Connecting to MCP servers...');
      await mcpClient.connectToServers(servers).catch((error) => {
        log('error', 'Failed to connect to MCP servers:', error);
      });

      log('info', 'Creating new agent instance...');
      const agent = await createAgent({
        provider,
        mcpClient,
      });

      log('info', 'Storing new conversation in service...');
      // Store the new conversation
      conversationService.addConversation(conversationId, agent, provider);

      return agent as AgentWithToolResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log('error', `Failed to initialize agent: ${errorMsg}`);
      throw new Error(`Failed to initialize agent: ${errorMsg}`);
    }
  };

  /**
   * Processes a user query using an agent and streams the responses
   */
  const processQuery = async (
    conversationId: string,
    query: string,
    context: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<string> => {
    log('info', `Processing query for conversation: ${conversationId}`);
    try {
      // No longer signal processing state with thinking
      // Remove: streamManager.sendThinking(conversationId, true);

      // Create a new abort controller if not provided
      const abortController = new AbortController();
      // Link the provided signal if any
      if (signal) {
        signal.addEventListener('abort', () => {
          abortController.abort();
        });
      }

      // Store the abort controller
      abortControllers.set(conversationId, abortController);

      // Get or create the agent
      const agent = await getOrCreateAgent(conversationId);

      // Add user message to the conversation history
      streamManager.sendMessage(conversationId, {
        id: uuidv4(),
        role: 'user',
        type: 'text',
        content: query,
        createdAt: new Date().toISOString(),
      });

      // Start streaming process in background
      void streamAgentResponse(conversationId, agent, query, context, abortController.signal);

      log('info', `Successfully initiated streaming for conversation: ${conversationId}`);
      return conversationId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(
        'error',
        `Error in processQuery for conversation ${conversationId}: ${errorMessage}`,
        error
      );
      streamManager.sendError(conversationId, errorMessage);
      throw error;
    }
  };

  /**
   * Streams the agent's response for a query
   */
  const streamAgentResponse = async (
    conversationId: string,
    agent: AgentWithToolResult,
    query: string,
    context: Record<string, any>,
    signal: AbortSignal
  ): Promise<void> => {
    log('info', `Starting stream for conversation: ${conversationId}`);
    let currentStreamingMessageId: string | null = null; // Track current text message ID
    const agentGenerator = agent.processQuery(query, context, signal);

    try {
      for await (const agentMessage of agentGenerator) {
        if (signal.aborted) {
          log('info', `Stream aborted for conversation: ${conversationId}`);
          break;
        }

        // Determine event type and payload based on message role and type
        let eventType = 'message';
        let eventPayload: any = agentMessage;

        if (agentMessage.role === 'assistant' && agentMessage.type === 'text') {
          if (agentMessage.id !== currentStreamingMessageId) {
            // New assistant text message starts
            currentStreamingMessageId = agentMessage.id;
            // Use sendMessage for the first chunk
            streamManager.sendMessage(conversationId, agentMessage);
          } else {
            // Use updateMessage for subsequent chunks
            streamManager.updateMessage(conversationId, agentMessage.id, {
              content: agentMessage.content,
            });
          }
        } else {
          // Any non-assistant-text message interrupts the stream
          if (currentStreamingMessageId) {
            log(
              'info',
              `Assistant text stream interrupted by ${agentMessage.type} message: ${agentMessage.id}`
            );
            currentStreamingMessageId = null;
          }

          // Handle specific types like tool requests
          if (agentMessage.type === 'tool_request') {
            // Store pending request details (assuming agentMessage structure matches ToolRequest)
            if (agentMessage.tool) {
              pendingToolRequests.set(agentMessage.id, {
                conversationId: conversationId,
                tool: agentMessage.tool,
              });

              const humanReadableToolCall = await getHumanReadableToolCall(
                agentMessage.tool,
                agentMessage.parameters
              );

              // Construct ToolRequest object
              const toolRequestPayload: ToolRequest = {
                requestId: agentMessage.id,
                tool: agentMessage.tool,
                parameters: agentMessage.parameters || {},
                humanReadableToolCall,
              };

              // Use sendToolRequest
              log('info', `Sending tool request: ${agentMessage.tool}`);
              streamManager.sendToolRequest(conversationId, toolRequestPayload);
            } else {
              // Fallback for safety, though tool_request should have a tool
              log('warn', 'Tool request message received without tool name', agentMessage);
              streamManager.sendMessage(conversationId, agentMessage);
            }
          } else {
            // Default: Use sendMessage for user messages, tool responses etc.
            streamManager.sendMessage(conversationId, agentMessage);
          }
        }
      }
      log('info', `Agent processing completed for conversation: ${conversationId}`);
      streamManager.sendComplete(conversationId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(
        'error',
        `Error in streamAgentResponse for conversation ${conversationId}: ${errorMsg}`,
        error
      );
      streamManager.sendError(conversationId, errorMsg);
      streamManager.sendComplete(conversationId); // Ensure completion is sent even on error
    }
  };

  /**
   * Handles a tool result from the client
   */
  const handleToolResult = async (
    conversationId: string,
    requestId: string,
    result?: unknown,
    error?: string
  ): Promise<boolean> => {
    log(
      'info',
      `Handling tool result for conversation: ${conversationId}, requestId: ${requestId}`
    );

    // Find the pending request
    const pendingRequest = pendingToolRequests.get(requestId);
    if (!pendingRequest) return false;

    if (pendingRequest.conversationId !== conversationId) return false;

    streamManager.sendMessage(conversationId, {
      id: uuidv4(),
      role: 'tool',
      type: 'tool_response',
      tool: pendingRequest.tool,
      content: typeof result === 'string' ? result : JSON.stringify(result),
      error,
      createdAt: new Date().toISOString(),
    });

    // Remove from pending requests
    pendingToolRequests.delete(requestId);

    return true;
  };

  /**
   * Registers a stream connection for a conversation
   */
  const registerStream = (conversationId: string, connection: SSEConnection): void => {
    log('info', `Registering stream connection for conversation ${conversationId}`);
    streamManager.registerConnection(connection);
  };

  /**
   * Removes a stream connection
   */
  const removeStream = (conversationId: string): void => {
    log('info', `Removing stream for conversation: ${conversationId}`);
    streamManager.removeConnection(conversationId);
    cancelRequest(conversationId);
  };

  /**
   * Cancels an ongoing request for a conversation
   */
  const cancelRequest = (conversationId: string): void => {
    const controller = abortControllers.get(conversationId);
    if (controller) {
      log('info', `Cancelling request for conversation: ${conversationId}`);
      controller.abort();
      abortControllers.delete(conversationId);
    }
  };

  /**
   * Gets the count of active conversations
   */
  const getActiveConversationsCount = (): number => {
    return conversationService.getActiveConversationsCount();
  };

  /**
   * Gets token usage information for a conversation
   * Follows same pattern as useTokenUsage in CLI
   */
  const getContextUsage = async (conversationId: string): Promise<TokenUsage> => {
    const conversation = conversationService.getConversation(conversationId);
    if (!conversation) {
      return {
        usedTokens: 0,
        maxTokens: 0,
        percentage: 0,
      };
    }

    const { agent } = conversation;

    try {
      // Get agent's messages and filter them like in CLI
      const agentMessages = agent.getMessages();

      // Convert messages to provider format (similar to CLI implementation)
      const providerMessages = agentMessages
        .filter((msg) => {
          // Include text messages and filter out system messages
          if (msg.type === 'text' && msg.role !== 'system') {
            return true;
          }

          // Include tool responses
          if (msg.type === 'tool_response') {
            return true;
          }

          return false;
        })
        .map((msg) => {
          if (msg.type === 'text') {
            return {
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: msg.content || '',
            };
          } else if (msg.type === 'tool_response') {
            // Format tool responses similar to how they're presented to the model
            const content = msg.error
              ? `[TOOL ERROR] Tool "${msg.tool}" execution failed: ${msg.error}`
              : `[TOOL RESULT] ${msg.tool || 'unknown'}: ${
                  typeof msg.content === 'string'
                    ? msg.content
                    : JSON.stringify(msg.content, null, 2)
                }`;

            return {
              role: 'user', // Tool responses are presented as user messages
              content,
            };
          }

          // Should never reach here due to filter, but TypeScript needs this
          return {
            role: 'user',
            content: '',
          };
        });

      // Get context usage from the agent
      const usage = await agent.getContextUsage(providerMessages as any);
      return usage;
    } catch (error) {
      console.error('Failed to get context usage:', error);

      // If we can get the max context length even if counting fails
      const maxTokens = agent.provider ? agent.provider.getMaxContextLength() : 0;

      return {
        usedTokens: 0,
        maxTokens,
        percentage: 0,
      };
    }
  };

  // Set up periodic cleanup of inactive conversations
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const MAX_CONVERSATION_AGE_MS = 60 * 60 * 1000; // 1 hour

  setInterval(() => {
    conversationService.cleanupInactiveConversations(MAX_CONVERSATION_AGE_MS);
  }, CLEANUP_INTERVAL_MS);

  return {
    processQuery,
    handleToolResult,
    registerStream,
    removeStream,
    getActiveConversationsCount,
    getContextUsage,
    cancelRequest,
  };
};
