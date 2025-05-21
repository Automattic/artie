import { createAgent, createProvider, createMCPClient, MCPServer } from '@artie/core';
import { useCallback, useMemo } from 'react';
import { useAppContext } from '../context/AppContext.js';
import { useChat } from './useChat.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * @fileoverview Hook for initializing and managing the agent instance.
 */

// Separate initialization logic into its own hook
const useAgentInit = (): (() => Promise<{ success: boolean; error?: string }>) => {
  const {
    state: { mcpServerNames },
    actions: { setAgent, setConnectedMCPServers, setError },
  } = useAppContext();

  const loadMCPServers = async (): Promise<MCPServer[]> => {
    try {
      // Load servers from config file
      const serversPath = path.resolve(process.cwd(), '../../mcp-servers.json');
      const exists = await fs
        .access(serversPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        console.warn(`MCP servers configuration file not found at: ${serversPath}`);
        return [];
      }

      const serversContent = await fs.readFile(serversPath, 'utf-8');
      const data = JSON.parse(serversContent);

      // Handle new format with mcpServers as the root object
      const mcpServersConfig = data.mcpServers || {};

      // Convert the new format to MCPServer array
      const allServers: MCPServer[] = Object.entries(mcpServersConfig).map(([name, config]) => {
        const serverConfig = config as {
          command: string;
          args: string[];
          type?: 'stdio' | 'sse';
          env?: Record<string, string>;
        };

        return {
          name,
          type: serverConfig.type || 'stdio', // Default to stdio if type is omitted
          command: serverConfig.command,
          args: serverConfig.args,
          env: serverConfig.env,
        };
      });

      // If server names are specified, filter to only those servers
      if (mcpServerNames.length > 0) {
        const filteredServers = allServers.filter((server) => mcpServerNames.includes(server.name));

        // Warn about any specified servers that weren't found
        const foundServerNames = new Set(filteredServers.map((s) => s.name));
        const missingServers = mcpServerNames.filter((name) => !foundServerNames.has(name));
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

  return useCallback(async () => {
    try {
      const provider = createProvider();
      const mcpClient = createMCPClient();

      // Load and connect to MCP servers
      const servers = await loadMCPServers();

      // Connect to servers but don't rely on its return value
      await mcpClient
        .connectToServers(servers)
        .then(() => {
          setConnectedMCPServers(servers.map((s) => s.name));
        })
        .catch(() => {
          // Set empty array on failure
          setConnectedMCPServers([]);
        });

      const newAgent = await createAgent({
        provider,
        mcpClient,
      });

      setAgent(newAgent);

      return { success: true };
    } catch (err) {
      const error = `Failed to initialize agent: ${
        err instanceof Error ? err.message : String(err)
      }`;

      setError(error);
      return { success: false, error };
    }
  }, [setAgent, setConnectedMCPServers, setError]);
};

export interface UseAgentReturn {
  initialized: boolean;
  sendMessage: (content: string) => Promise<void>;
  cancelRequest: () => void;
  cleanup: () => void;
  isLoading: boolean;
  initAgent: () => Promise<{ success: boolean; error?: string }>;
}

export const useAgent = (): UseAgentReturn => {
  const { state, actions } = useAppContext();
  const { agent, cancelToken } = state;
  const { setError, setCancelToken } = actions;
  const {
    addUserMessage,
    addAssistantMessage,
    addToolRequestMessage,
    updateMessageContent,
    updateToolMessage,
    setIsLoading,
  } = useChat();

  const initAgent = useAgentInit();

  const sendMessage = useCallback(
    async (content: string) => {
      if (content.trim() === '') return;

      // Handle exit commands
      if (content.toLowerCase() === 'exit' || content.toLowerCase() === 'quit') {
        process.exit(0);
      }

      const isToolResultMessage = content.startsWith('Tool ') && content.includes(' returned: ');
      if (!isToolResultMessage) {
        addUserMessage(content);
      }

      if (!agent) {
        console.error('Agent is null, cannot process message');
        addAssistantMessage(
          "I'm sorry, there was an issue with the agent. Please restart the application."
        );
        return;
      }

      setIsLoading(true);
      const abortController = new AbortController();
      setCancelToken(abortController);

      // Create initial placeholder message for the assistant
      const assistantMessageId = addAssistantMessage('');

      try {
        let responseText = '';
        let currentAssistantMessageId = assistantMessageId;
        let hasExecutedTool = false;

        for await (const message of agent.processQuery(content, abortController.signal)) {
          if (message.type === 'text' && message.role === 'assistant') {
            responseText = message.content || '';
            if (responseText.includes('<!DOCTYPE html')) continue;

            // If we've already executed a tool, create a new assistant message
            // instead of updating the previous one
            if (hasExecutedTool) {
              currentAssistantMessageId = addAssistantMessage(responseText);
              hasExecutedTool = false; // Reset for potential future tool calls
            } else {
              updateMessageContent(currentAssistantMessageId, responseText);
            }
          } else if (message.type === 'tool_request' && message.tool) {
            const toolMessageId = addToolRequestMessage(
              message.tool,
              message.parameters || {},
              message.toolMetadata
            );
            try {
              if (!agent.mcpClient) {
                throw new Error('MCP client is not initialized');
              }

              const result = await agent.mcpClient.executeTool(
                message.tool,
                message.parameters || {}
              );
              updateToolMessage(toolMessageId, result);
              hasExecutedTool = true;
            } catch (error) {
              console.error('[useAgent] Tool execution failed:', {
                tool: message.tool,
                error: error instanceof Error ? error.message : String(error),
              });

              updateToolMessage(toolMessageId, {
                isError: true,
                error: error instanceof Error ? error.message : String(error),
              });
              hasExecutedTool = true;
            }
          } else if (message.type === 'tool_response' && message.tool) {
            updateToolMessage(message.id, {
              isError: !!message.error,
              content: message.error ? undefined : message.content,
              error: message.error,
            });

            // Handle Claude API overloaded errors specifically
            if (
              message.error &&
              typeof message.error === 'string' &&
              (message.error.includes('Claude API') || message.tool === 'claude_api')
            ) {
              // Check for overloaded error pattern
              if (
                message.error.includes('overloaded_error') ||
                message.error.includes('Overloaded')
              ) {
                setError('Claude API is currently overloaded. Please try again in a few moments.');
              } else {
                // Handle other Claude API errors
                setError(`${message.error}`);
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setError('Request was cancelled');
        } else {
          const errorMsg = err instanceof Error ? err.message : String(err);

          // Try to parse for Claude API overloaded errors
          if (errorMsg.includes('overloaded_error') || errorMsg.includes('Overloaded')) {
            setError('Claude API is currently overloaded. Please try again in a few moments.');
          } else if (errorMsg.includes('Claude API') || errorMsg.includes('anthropic')) {
            setError(`Claude API error: ${errorMsg}`);
          } else {
            setError(`Error: ${errorMsg}`);
          }
        }
      } finally {
        setIsLoading(false);
        setCancelToken(null);
      }
    },
    [
      agent,
      addUserMessage,
      addAssistantMessage,
      addToolRequestMessage,
      updateMessageContent,
      updateToolMessage,
      setIsLoading,
      setError,
      setCancelToken,
    ]
  );

  const cancelRequest = useCallback(() => {
    if (cancelToken) {
      cancelToken.abort();
      setCancelToken(null);
    }
  }, [cancelToken, setCancelToken]);

  const cleanup = useCallback(() => {
    if (cancelToken) {
      cancelToken.abort();
      setCancelToken(null);
    }
  }, [cancelToken, setCancelToken]);

  return useMemo(
    () => ({
      initialized: !!agent,
      sendMessage,
      cancelRequest,
      cleanup,
      isLoading: state.isLoading,
      initAgent, // Expose initialization function
    }),
    [agent, sendMessage, cancelRequest, cleanup, state.isLoading, initAgent]
  );
};
