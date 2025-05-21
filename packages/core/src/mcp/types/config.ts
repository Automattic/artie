/**
 * @fileoverview Type definition for MCP server configuration.
 */

/**
 * Union type representing configuration options for different types of MCP servers.
 * @typedef {Object} ServerConfig
 * @property {'stdio' | 'sse'} type - The type of server connection
 * @property {string} command - For stdio: command to execute; For SSE: server URL
 * @property {string[]} args - For stdio: command arguments; For SSE: not used
 * @property {Record<string, string>} [env] - For stdio: environment variables
 * @property {string} [serverUrl] - For SSE: base URL of the server
 * @property {string} [messagesEndpoint] - For SSE: endpoint for messages
 */
export type ServerConfig =
  | {
      type: 'stdio';
      command: string;
      args: string[];
      env?: Record<string, string>;
    }
  | {
      type: 'sse';
      serverUrl: string;
      messagesEndpoint: string;
    };
