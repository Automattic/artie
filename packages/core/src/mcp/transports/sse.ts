import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export const createSSETransport = (
  serverUrl: string
  // messagesEndpoint parameter removed as it's not used
): SSEClientTransport => {
  console.log('Creating SSE transport with serverUrl:', serverUrl);
  // Pass only the serverUrl (SSE endpoint) to the constructor.
  // The SDK's transport should handle finding the messages endpoint.
  return new SSEClientTransport(new URL(serverUrl));
};
