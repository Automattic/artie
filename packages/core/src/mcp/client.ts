import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from './types/transport.js';
import { createStdioTransport } from './transports/stdio.js';
import { createSSETransport } from './transports/sse.js';
import { Tool, ToolResponse, Resource, Prompt, PromptResult, ServerConfig } from './index.js';
import { createFileLogger, type Logger } from '../utils/logger/index.js';
import { validateSchema, validateParameters } from './validators/schemaValidator.js';

/**
 * Configuration interface for an MCP server connection.
 * @interface MCPServer
 * @property {string} name - The unique identifier for the server
 * @property {'stdio' | 'sse'} [type] - The transport type to use for communication
 * @property {string} [serverUrl] - The URL of an sse server
 * @property {string} command - The command to execute for stdio or the server URL for SSE
 * @property {string[]} args - Command line arguments or SSE endpoint paths
 * @property {Record<string, string>} [env] - Optional environment variables for the server process

 */
export interface MCPServer {
  name: string;
  type?: 'stdio' | 'sse';
  command: string;
  args: string[];
  serverUrl?: string;
  env?: Record<string, string>;
}

/**
 * Interface defining the core functionality of an MCP client.
 * @interface MCPClient
 */
export interface MCPClient {
  connect(config: ServerConfig, serverName?: string): Promise<Tool[]>;
  connectToServers(servers: MCPServer[]): Promise<string[]>;
  disconnect(): Promise<void>;
  getTools(): Tool[];
  executeTool(name: string, parameters: Record<string, unknown>): Promise<ToolResponse>;
  listResources(): Promise<string[]>;
  readResource(uri: string): Promise<Resource>;
  listPrompts(): Promise<Prompt[]>;
  getPrompt(name: string, args: Record<string, unknown>): Promise<PromptResult>;
}

/**
 * Creates a new MCP client instance with tool management and server communication capabilities.
 * @returns {MCPClient} A new MCP client instance
 * @remarks
 * The MCP client manages connections to one or more servers, handling tool discovery,
 * validation, and execution. It maintains separate tool registries for each server
 * and provides namespaced access to tools across all connected servers. The client
 * uses a file-based logger for debugging and error tracking.
 */
export const createMCPClient = (): MCPClient => {
  let tools: Tool[] = [];
  let mcp: Client | null = null;
  let transport: Transport | null = null;
  const logger: Logger = createFileLogger();
  let connectedServers: string[] = [];
  // Track tools by server to avoid overwriting
  let serverTools: Record<string, Tool[]> = {};
  // Track server connections
  let serverConnections: Record<string, { client: Client; transport: Transport }> = {};
  // Track which server each tool belongs to
  let toolToServerMap: Record<string, string> = {};

  /**
   * Connects to an MCP server and retrieves available tools.
   * @param {ServerConfig} config - The server configuration
   * @param {string} [serverName] - Optional server name for multi-server setups
   * @returns {Promise<Tool[]>} List of available tools from the server
   * @throws {Error} If connection fails
   * @remarks
   * This function performs several key operations:
   * 1. Creates a new client instance with basic capabilities
   * 2. Establishes transport layer connection (stdio or SSE)
   * 3. Validates and processes tool schemas from the server
   * 4. Handles namespacing for multi-server setups
   * 5. Maintains backward compatibility with single-server mode
   */
  const connect = async (config: ServerConfig, serverName?: string): Promise<Tool[]> => {
    try {
      const newClient = new Client(
        {
          name: 'mcp-client',
          version: '1.0.0',
        },
        {
          capabilities: {
            prompts: {},
            resources: {},
            tools: {},
          },
        }
      );

      console.log('Creating transport for server', config);

      const newTransport =
        config.type === 'stdio'
          ? createStdioTransport(config.command, config.args, config.env)
          : createSSETransport(config.serverUrl);

      await newClient.connect(newTransport);

      // Set the current client and transport for backward compatibility
      mcp = newClient;
      transport = newTransport;

      const toolsResult = await newClient.listTools();

      // Process and validate tools
      const serverToolsList: Tool[] = [];

      for (const tool of toolsResult.tools) {
        // Validate the schema
        const validation = await validateSchema(
          tool.inputSchema,
          `${serverName || 'server'}:${tool.name}`
        );

        if (!validation.isValid && !validation.fixedSchema) {
          // Schema is invalid and couldn't be fixed, skip this tool
          await logger.warn('Skipping tool with invalid schema', {
            toolName: tool.name,
            serverName,
            errors: validation.errors,
          });
          continue;
        }

        // Use the fixed schema if available
        const finalSchema = validation.fixedSchema || tool.inputSchema;

        // Add the validated tool
        serverToolsList.push({
          name: tool.name,
          description: tool.description || '',
          input_schema: finalSchema,
        });
      }

      // Store tools by server and update the combined tools list
      if (serverName) {
        // Store the client and transport for this server
        serverConnections[serverName] = { client: newClient, transport: newTransport };

        // Create namespaced tools
        const namespacedTools: Tool[] = serverToolsList.map((tool) => {
          // Create namespaced name
          const namespacedName = `${serverName}__${tool.name}`;

          // Map the namespaced name to its server
          toolToServerMap[namespacedName] = serverName;

          // Create a new tool with namespaced name
          return {
            ...tool,
            name: namespacedName,
            // Enhance description to include server info
            description: `[${serverName}] ${tool.description}`,
          };
        });

        // Store only the namespaced tools for this server
        serverTools[serverName] = namespacedTools;

        // Rebuild the combined tools list from all servers
        tools = Object.values(serverTools).flat();
      } else {
        // Just use these tools if no server name provided (single server case)
        tools = serverToolsList;
      }

      return serverToolsList;
    } catch (error) {
      await logger.error('Connection failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to connect to server: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  /**
   * Connects to multiple MCP servers simultaneously.
   * @param {MCPServer[]} servers - Array of server configurations
   * @returns {Promise<string[]>} List of successfully connected server names
   * @remarks
   * This function manages multiple server connections by:
   * 1. Resetting all existing connections and tool registries
   * 2. Attempting to connect to each server independently
   * 3. Maintaining separate tool registries for each server
   * 4. Continuing even if some connections fail
   * 5. Creating a unified view of all available tools
   */
  const connectToServers = async (servers: MCPServer[]): Promise<string[]> => {
    connectedServers = [];
    // Reset tools collection when connecting to multiple servers
    tools = [];
    serverTools = {};
    toolToServerMap = {};
    serverConnections = {};

    for (const server of servers) {
      const config: ServerConfig =
        (server.type || 'stdio') === 'stdio'
          ? {
              type: 'stdio',
              command: server.command,
              args: server.args,
              env: server.env,
            }
          : {
              type: 'sse',
              serverUrl: server.serverUrl || server.command,
              messagesEndpoint: server.args?.[0] || '/messages',
            };

      try {
        await connect(config, server.name);
        connectedServers.push(server.name);
      } catch (error) {
        await logger.error('Failed to connect to server', {
          serverName: server.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return connectedServers;
  };

  /**
   * Disconnects from all connected servers and cleans up resources.
   * @returns {Promise<void>}
   */
  const disconnect = async (): Promise<void> => {
    try {
      // Close all server connections
      for (const [serverName, connection] of Object.entries(serverConnections)) {
        try {
          await connection.client.close();
        } catch (error) {
          await logger.error('Error disconnecting from server', { serverName, error });
        }
      }
    } catch (error) {
      await logger.error('Error during disconnect', { error });
    } finally {
      transport = null;
      mcp = null;
      tools = [];
      serverTools = {};
      toolToServerMap = {};
      serverConnections = {};
      connectedServers = [];
    }
  };

  /**
   * Returns the list of all available tools across all connected servers.
   * @returns {Tool[]} Array of available tools
   */
  const getTools = (): Tool[] => tools;

  /**
   * Executes a tool with the given parameters.
   * @param {string} name - The namespaced tool name (format: serverName__toolName)
   * @param {Record<string, unknown>} parameters - Tool parameters
   * @returns {Promise<ToolResponse>} Tool execution result
   * @remarks
   * Tool execution follows this process:
   * 1. Validates the namespaced tool name format
   * 2. Locates the appropriate server connection
   * 3. Validates input parameters against the tool's schema
   * 4. Executes the tool on the target server
   * 5. Processes and logs the result
   *
   * Error handling includes:
   * - Invalid tool name format
   * - Server not found
   * - Tool not found
   * - Parameter validation failures
   * - Runtime execution errors
   */
  const executeTool = async (
    name: string,
    parameters: Record<string, unknown> = {}
  ): Promise<ToolResponse> => {
    // Handle namespaced tool names (format: serverName__toolName)
    if (!name.includes('__')) {
      await logger.error('MCP Client: Tool execution failed - tool name must be namespaced', {
        toolName: name,
        availableTools: tools.map((t) => t.name),
      });
      return {
        isError: true,
        error: `Tool name must be in format "serverName__toolName". Available tools: ${tools
          .map((t) => t.name)
          .join(', ')}`,
      };
    }

    // Extract server and tool name from the namespaced name
    const parts = name.split('__');
    if (parts.length !== 2) {
      await logger.error('MCP Client: Tool execution failed - invalid namespaced format', {
        toolName: name,
      });
      return {
        isError: true,
        error: `Invalid tool name format. Expected "serverName__toolName", got "${name}"`,
      };
    }

    const [serverName, actualToolName] = parts;
    const connection = serverName ? serverConnections[serverName] : null;

    if (!serverName || !connection) {
      await logger.error('MCP Client: Tool execution failed - server not found', {
        toolName: name,
        serverName,
        availableServers: Object.keys(serverConnections),
      });
      return {
        isError: true,
        error: `Server "${serverName}" not found. Available servers: ${Object.keys(
          serverConnections
        ).join(', ')}`,
      };
    }

    try {
      // Find the tool to get its schema
      const tool = tools.find((t) => t.name === name);

      if (!tool) {
        await logger.error('MCP Client: Tool execution failed - tool not found', {
          toolName: name,
          actualToolName,
          serverName,
          availableTools: tools.map((t) => t.name),
        });
        return {
          isError: true,
          error: `Tool "${name}" not found. Available tools: ${tools
            .map((t) => t.name)
            .join(', ')}`,
        };
      }

      // Validate parameters against schema
      const validation = await validateParameters(tool.input_schema, parameters, name);

      if (!validation.isValid) {
        await logger.error('MCP Client: Tool execution failed - parameter validation failed', {
          toolName: name,
          params: parameters,
          errors: validation.errors,
          missingParams: validation.missingParams,
        });
        return {
          isError: true,
          error: validation.errors.join('; '),
        };
      }

      // Execute the tool using the correct server connection and the actual tool name
      // (not the namespaced version)
      const result = await connection.client.callTool({
        name: actualToolName,
        arguments: parameters,
      });

      // Process the result
      const processedResult: ToolResponse = {
        isError: false,
        content: result.content,
      };

      // Ensure proper serialization of object responses
      if (typeof result.content === 'object' && result.content !== null) {
        try {
          // Try to safely stringify the object
          processedResult.content = JSON.stringify(result.content, null, 2);
        } catch (err) {
          await logger.error('Failed to serialize tool response object', {
            toolName: name,
            error: err instanceof Error ? err.message : String(err),
          });
          return {
            isError: true,
            error: 'Failed to process response: Could not serialize object result',
          };
        }
      }

      return processedResult;
    } catch (error) {
      await logger.error('MCP Client: Tool execution failed - runtime error', {
        toolName: name,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isError: true,
        error: `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  };

  /**
   * Lists all available resources from the connected server.
   * @returns {Promise<string[]>} Array of resource URIs
   * @throws {Error} If not connected to a server
   * @remarks
   * Resources are unique to each server connection. This function currently
   * only works with the primary server connection (backward compatibility mode).
   * For multi-server setups, consider using server-specific resource listing.
   */
  const listResources = async (): Promise<string[]> => {
    if (!mcp || !transport) {
      await logger.error('Cannot list resources - not connected to server');
      throw new Error('Not connected to server');
    }

    try {
      const result = await mcp.listResources();
      return result.resources.map((r) => r.uri);
    } catch (error) {
      await logger.error('Failed to list resources', { error });
      throw error;
    }
  };

  /**
   * Reads a resource from the connected server.
   * @param {string} uri - The URI of the resource to read
   * @returns {Promise<Resource>} The resource content
   * @throws {Error} If not connected or resource cannot be read
   * @remarks
   * Resource reading is performed on the primary server connection.
   * The function expects the resource to return text content and will
   * throw an error if the resource cannot be read or if the server
   * is not connected.
   */
  const readResource = async (uri: string): Promise<Resource> => {
    if (!mcp || !transport) {
      await logger.error('Cannot read resource - not connected to server', { uri });
      throw new Error('Not connected to server');
    }

    try {
      const result = await mcp.readResource({ uri });
      const content = result.contents[0];

      return {
        uri: content.uri,
        text: content.text as string,
      };
    } catch (error) {
      await logger.error('Failed to read resource', { uri, error });
      throw error;
    }
  };

  /**
   * Lists all available prompts from the connected server.
   * @returns {Promise<Prompt[]>} Array of available prompts
   * @throws {Error} If not connected to a server
   * @remarks
   * Prompts are templates that can be executed with arguments.
   * This function retrieves all available prompts and normalizes
   * their metadata, ensuring all optional fields have default values.
   * Currently only works with the primary server connection.
   */
  const listPrompts = async (): Promise<Prompt[]> => {
    if (!mcp || !transport) {
      await logger.error('Cannot list prompts - not connected to server');
      throw new Error('Not connected to server');
    }

    try {
      const result = await mcp.listPrompts();
      return result.prompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description || '',
        arguments: (prompt.arguments || []).map((arg) => ({
          name: arg.name,
          description: arg.description || '',
          required: arg.required || false,
        })),
      }));
    } catch (error) {
      await logger.error('Failed to list prompts', { error });
      throw error;
    }
  };

  /**
   * Retrieves a specific prompt with the given arguments.
   * @param {string} name - The name of the prompt
   * @param {Record<string, unknown>} args - Prompt arguments
   * @returns {Promise<PromptResult>} The prompt result
   * @throws {Error} If not connected or prompt cannot be retrieved
   * @remarks
   * This function:
   * 1. Validates the server connection
   * 2. Converts all argument values to strings
   * 3. Executes the prompt on the server
   * 4. Returns the resulting messages
   * Note: All prompt arguments are converted to strings before sending to the server.
   */
  const getPrompt = async (name: string, args: Record<string, unknown>): Promise<PromptResult> => {
    if (!mcp || !transport) {
      await logger.error('Cannot get prompt - not connected to server', { promptName: name });
      throw new Error('Not connected to server');
    }

    try {
      const result = await mcp.getPrompt({
        name,
        arguments: Object.fromEntries(
          Object.entries(args).map(([key, value]) => [key, String(value)])
        ),
      });

      return { messages: result.messages };
    } catch (error) {
      await logger.error('Failed to get prompt', { promptName: name, error });
      throw error;
    }
  };

  return {
    connect,
    connectToServers,
    disconnect,
    getTools,
    executeTool,
    listResources,
    readResource,
    listPrompts,
    getPrompt,
  };
};
