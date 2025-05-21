import { describe, test, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { processToolQueue } from '../toolQueue.js';
import type { Message, QueuedToolRequest } from '../../types.js';
import type { Tool } from '../../../mcp/types/tool.js';
import type { MCPClient } from '../../../mcp/index.js';
import type { Logger } from '../../../utils/logger/index.js';
import type { Provider } from '../../../provider/types.js';

vi.mock('../toolExecution.js', () => ({
  executeToolRequest: vi.fn().mockImplementation(async function* (request) {
    yield {
      id: randomUUID(),
      role: 'user',
      type: 'tool_response',
      tool: request.tool,
      content: 'Tool execution success',
      createdAt: new Date().toISOString(),
      isComplete: true,
    };
  }),
}));

// Mock getContinuationResponse to yield a response each time it's called
let continuationCallCount = 0;
vi.mock('../../provider/providerInteraction.js', () => ({
  getContinuationResponse: vi.fn().mockImplementation(async function* () {
    continuationCallCount++;
    yield {
      id: randomUUID(),
      role: 'assistant',
      type: 'text',
      content: `Continuation response ${continuationCallCount}`,
      createdAt: new Date().toISOString(),
      isComplete: true,
    };
  }),
}));

describe('processToolQueue', () => {
  let mockTools: Tool[];
  let mockToolRequestQueue: QueuedToolRequest[];
  let mockMessages: Message[];
  let mockFailedToolAttempts: Record<string, Set<string>>;
  let mockProvider: Provider;
  let mockMCPClient: MCPClient;
  let mockLogger: Logger;
  let mockAddMessage: (message: Message) => void;
  let mockEnqueueToolRequest: (toolName: string, parameters: Record<string, unknown>) => void;
  let mockRegisterPendingRequest: (requestId: string) => void;
  let mockCompletePendingRequest: (requestId: string) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    continuationCallCount = 0;

    // Setup mock tools
    mockTools = [
      {
        name: 'test_tool',
        description: 'A test tool',
        input_schema: {
          properties: {
            param1: { type: 'string' },
          },
          required: ['param1'],
        },
      },
    ];

    // Setup mock messages
    mockMessages = [];

    // Setup failed tool attempts tracking
    mockFailedToolAttempts = {};

    // Setup mock provider
    mockProvider = {
      complete: vi.fn(),
      getMaxContextLength: vi.fn().mockReturnValue(4000),
      getContextUsage: vi.fn().mockResolvedValue({
        usedTokens: 100,
        maxTokens: 4000,
        percentage: 2.5,
      }),
      countTokens: vi.fn().mockResolvedValue(100),
      supportsToolCalling: vi.fn().mockReturnValue(true),
      getProviderType: vi.fn().mockReturnValue('test'),
    };

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

    // Setup mock tool request handler
    mockEnqueueToolRequest = vi.fn();

    // Setup mock request tracking
    mockRegisterPendingRequest = vi.fn();
    mockCompletePendingRequest = vi.fn();
  });

  test('should process a single tool request successfully', async () => {
    // Create request before adding to queue
    const request: QueuedToolRequest = {
      id: randomUUID(),
      tool: 'test_tool',
      parameters: { param1: 'test' },
    };
    mockToolRequestQueue = [request];

    const generator = processToolQueue(
      mockTools,
      mockToolRequestQueue,
      mockMessages,
      mockFailedToolAttempts,
      mockProvider,
      mockMCPClient,
      mockLogger,
      mockAddMessage,
      mockEnqueueToolRequest,
      mockRegisterPendingRequest,
      mockCompletePendingRequest
    );

    const messages: Message[] = [];
    for await (const message of generator) {
      messages.push(message);
    }

    expect(messages.length).toBe(2); // Tool response + continuation response
    expect(messages[0].type).toBe('tool_response');
    expect(messages[0].content).toBe('Tool execution success');
    expect(messages[1].type).toBe('text');
    expect(messages[1].content).toBe('Continuation response 1');
    expect(mockRegisterPendingRequest).toHaveBeenCalledWith(request.id);
    expect(mockCompletePendingRequest).toHaveBeenCalledWith(request.id);
  });

  test('should process multiple tool requests in sequence', async () => {
    // Create requests before adding to queue
    const request1: QueuedToolRequest = {
      id: randomUUID(),
      tool: 'test_tool',
      parameters: { param1: 'test1' },
    };
    const request2: QueuedToolRequest = {
      id: randomUUID(),
      tool: 'test_tool',
      parameters: { param1: 'test2' },
    };
    mockToolRequestQueue = [request1, request2];

    // Process first request
    const generator1 = processToolQueue(
      mockTools,
      mockToolRequestQueue,
      mockMessages,
      mockFailedToolAttempts,
      mockProvider,
      mockMCPClient,
      mockLogger,
      mockAddMessage,
      mockEnqueueToolRequest,
      mockRegisterPendingRequest,
      mockCompletePendingRequest
    );

    const messages: Message[] = [];
    for await (const message of generator1) {
      messages.push(message);
    }

    // Process second request
    const generator2 = processToolQueue(
      mockTools,
      mockToolRequestQueue,
      mockMessages,
      mockFailedToolAttempts,
      mockProvider,
      mockMCPClient,
      mockLogger,
      mockAddMessage,
      mockEnqueueToolRequest,
      mockRegisterPendingRequest,
      mockCompletePendingRequest
    );

    for await (const message of generator2) {
      messages.push(message);
    }

    expect(messages.length).toBe(4); // 2 tool responses + 2 continuation responses
    expect(messages.filter((m) => m.type === 'tool_response').length).toBe(2);
    expect(messages.filter((m) => m.type === 'text').length).toBe(2);
    expect(messages[1].content).toBe('Continuation response 1');
    expect(messages[3].content).toBe('Continuation response 2');
    expect(mockRegisterPendingRequest).toHaveBeenCalledWith(request1.id);
    expect(mockRegisterPendingRequest).toHaveBeenCalledWith(request2.id);
    expect(mockCompletePendingRequest).toHaveBeenCalledWith(request1.id);
    expect(mockCompletePendingRequest).toHaveBeenCalledWith(request2.id);
  });

  test('should handle tool execution errors and continue processing', async () => {
    // Mock executeToolRequest to throw an error for the first request
    const { executeToolRequest } = await import('../toolExecution.js');
    let requestCount = 0;
    vi.mocked(executeToolRequest).mockImplementation(async function* (request) {
      requestCount++;
      if (requestCount === 1) {
        throw new Error('Tool execution failed');
      }
      yield {
        id: randomUUID(),
        role: 'user',
        type: 'tool_response',
        tool: request.tool,
        content: 'Tool execution success',
        createdAt: new Date().toISOString(),
        isComplete: true,
      };
    });

    // Create requests before adding to queue
    const request1: QueuedToolRequest = {
      id: randomUUID(),
      tool: 'test_tool',
      parameters: { param1: 'test1' },
    };
    const request2: QueuedToolRequest = {
      id: randomUUID(),
      tool: 'test_tool',
      parameters: { param1: 'test2' },
    };
    mockToolRequestQueue = [request1, request2];

    // Process first request (will fail)
    const generator1 = processToolQueue(
      mockTools,
      mockToolRequestQueue,
      mockMessages,
      mockFailedToolAttempts,
      mockProvider,
      mockMCPClient,
      mockLogger,
      mockAddMessage,
      mockEnqueueToolRequest,
      mockRegisterPendingRequest,
      mockCompletePendingRequest
    );

    const messages: Message[] = [];
    for await (const message of generator1) {
      messages.push(message);
    }

    // Process second request (should succeed)
    const generator2 = processToolQueue(
      mockTools,
      mockToolRequestQueue,
      mockMessages,
      mockFailedToolAttempts,
      mockProvider,
      mockMCPClient,
      mockLogger,
      mockAddMessage,
      mockEnqueueToolRequest,
      mockRegisterPendingRequest,
      mockCompletePendingRequest
    );

    for await (const message of generator2) {
      messages.push(message);
    }

    // Should have error message from first request, tool response and continuation from second
    expect(messages.length).toBe(3);
    expect(messages[0].type).toBe('text');
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Tool execution failed');
    expect(messages[1].type).toBe('tool_response');
    expect(messages[1].content).toBe('Tool execution success');
    expect(messages[2].type).toBe('text');
    expect(messages[2].content).toBe('Continuation response 1');

    // Both requests should be marked as completed
    expect(mockRegisterPendingRequest).toHaveBeenCalledWith(request1.id);
    expect(mockRegisterPendingRequest).toHaveBeenCalledWith(request2.id);
    expect(mockCompletePendingRequest).toHaveBeenCalledWith(request1.id);
    expect(mockCompletePendingRequest).toHaveBeenCalledWith(request2.id);

    // Error should be logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      'TOOL QUEUE ERROR: Failed to process tool request',
      expect.objectContaining({
        error: 'Tool execution failed',
        toolName: request1.tool,
        requestId: request1.id,
      })
    );
  });
});
