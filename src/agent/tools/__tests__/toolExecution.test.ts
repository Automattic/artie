import { describe, test, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { executeToolRequest } from '../toolExecution.js';
import type { Message, QueuedToolRequest } from '../../types.js';
import type { Tool } from '../../../mcp/types/tool.js';
import type { MCPClient } from '../../../mcp/index.js';
import type { Logger } from '../../../utils/logger/index.js';

describe('executeToolRequest', () => {
  let mockTools: Tool[];
  let mockMessages: Message[];
  let mockFailedToolAttempts: Record<string, Set<string>>;
  let mockMCPClient: MCPClient;
  let mockLogger: Logger;
  let mockAddMessage: (message: Message) => void;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock tools
    mockTools = [
      {
        name: 'test_tool',
        description: 'A test tool',
        input_schema: {
          properties: {
            param1: { type: 'string' },
            url: { type: 'string' },
          },
          required: ['param1'],
        },
      },
    ];

    // Setup mock messages
    mockMessages = [];

    // Setup failed tool attempts tracking
    mockFailedToolAttempts = {};

    // Setup mock MCP client
    mockMCPClient = {
      executeTool: vi.fn().mockResolvedValue({ content: 'Success', isError: false }),
    } as unknown as MCPClient;

    // Setup mock logger
    mockLogger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    };

    // Setup mock message handler
    mockAddMessage = vi.fn();
  });

  test('should successfully execute a tool with valid parameters', async () => {
    const request: QueuedToolRequest = {
      id: randomUUID(),
      tool: 'test_tool',
      parameters: { param1: 'test' },
    };

    const generator = executeToolRequest(
      request,
      mockTools,
      mockMessages,
      mockFailedToolAttempts,
      mockMCPClient,
      mockLogger,
      mockAddMessage
    );

    const messages: Message[] = [];
    for await (const message of generator) {
      messages.push(message);
    }

    expect(messages.length).toBe(1);
    expect(messages[0].type).toBe('tool_response');
    expect(messages[0].content).toBe('Success');
    expect(messages[0].error).toBeUndefined();
    expect(mockMCPClient.executeTool).toHaveBeenCalledWith('test_tool', { param1: 'test' });
    expect(mockAddMessage).toHaveBeenCalledTimes(1);
  });

  test('should prevent retrying failed tool attempts', async () => {
    const params = { param1: 'test' };
    const paramsKey = JSON.stringify(params);

    // Setup a previously failed attempt
    mockFailedToolAttempts['test_tool'] = new Set([paramsKey]);

    const request: QueuedToolRequest = {
      id: randomUUID(),
      tool: 'test_tool',
      parameters: params,
    };

    const generator = executeToolRequest(
      request,
      mockTools,
      mockMessages,
      mockFailedToolAttempts,
      mockMCPClient,
      mockLogger,
      mockAddMessage
    );

    const messages: Message[] = [];
    for await (const message of generator) {
      messages.push(message);
    }

    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].type).toBe('text');
    expect(messages[0].content).toContain('already attempted');
    expect(mockMCPClient.executeTool).not.toHaveBeenCalled();
  });

  test('should auto-extract URL parameter from assistant messages', async () => {
    // Setup a tool that requires a URL parameter
    mockTools = [
      {
        name: 'url_tool',
        description: 'A tool that requires a URL',
        input_schema: {
          properties: {
            url: { type: 'string' },
          },
          required: ['url'],
        },
      },
    ];

    // Add an assistant message containing a URL
    mockMessages = [
      {
        id: randomUUID(),
        role: 'assistant',
        type: 'text',
        content: 'Please check this URL: https://example.com/test',
        createdAt: new Date().toISOString(),
        isComplete: true,
      },
    ];

    const request: QueuedToolRequest = {
      id: randomUUID(),
      tool: 'url_tool',
      parameters: {},
    };

    const generator = executeToolRequest(
      request,
      mockTools,
      mockMessages,
      mockFailedToolAttempts,
      mockMCPClient,
      mockLogger,
      mockAddMessage
    );

    const messages: Message[] = [];
    for await (const message of generator) {
      messages.push(message);
    }

    expect(messages.length).toBe(1);
    expect(messages[0].type).toBe('tool_response');
    expect(messages[0].content).toBe('Success');
    expect(mockMCPClient.executeTool).toHaveBeenCalledWith('url_tool', {
      url: 'https://example.com/test',
    });
  });

  test('should throw error for missing required parameters', async () => {
    // Setup a tool with required parameters
    mockTools = [
      {
        name: 'required_tool',
        description: 'A tool with required parameters',
        input_schema: {
          properties: {
            required1: { type: 'string' },
            required2: { type: 'string' },
          },
          required: ['required1', 'required2'],
        },
      },
    ];

    const request: QueuedToolRequest = {
      id: randomUUID(),
      tool: 'required_tool',
      parameters: { required1: 'test' }, // Missing required2
    };

    const generator = executeToolRequest(
      request,
      mockTools,
      mockMessages,
      mockFailedToolAttempts,
      mockMCPClient,
      mockLogger,
      mockAddMessage
    );

    await expect(async () => {
      for await (const message of generator) {
        // Consume generator
        void message;
      }
    }).rejects.toThrow('Missing required parameters');

    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockMCPClient.executeTool).not.toHaveBeenCalled();
  });

  test('should handle object response from tool', async () => {
    const objectResponse = {
      key1: 'value1',
      key2: 'value2',
    };

    mockMCPClient = {
      executeTool: vi.fn().mockResolvedValue({ content: objectResponse, isError: false }),
    } as unknown as MCPClient;

    const request: QueuedToolRequest = {
      id: randomUUID(),
      tool: 'test_tool',
      parameters: { param1: 'test' },
    };

    const generator = executeToolRequest(
      request,
      mockTools,
      mockMessages,
      mockFailedToolAttempts,
      mockMCPClient,
      mockLogger,
      mockAddMessage
    );

    const messages: Message[] = [];
    for await (const message of generator) {
      messages.push(message);
    }

    expect(messages.length).toBe(1);
    expect(messages[0].type).toBe('tool_response');
    expect(messages[0].content).toBe(JSON.stringify(objectResponse, null, 2));
    expect(messages[0].error).toBeUndefined();
    expect(mockMCPClient.executeTool).toHaveBeenCalledWith('test_tool', { param1: 'test' });
  });
});
