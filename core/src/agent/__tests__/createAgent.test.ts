import { describe, test, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { createAgent } from '../createAgent.js';
import type { Agent } from '../types.js';
import type { Provider } from '../../provider/types.js';
import type { MCPClient } from '../../mcp/index.js';

// Mock dependencies
vi.mock('../utils/logger/index.js', () => ({
  createFileLogger: vi.fn().mockReturnValue({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('createAgent', () => {
  let mockProvider: Provider;
  let mockMCPClient: MCPClient & { executeToolByName: ReturnType<typeof vi.fn> };
  let agent: Agent;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock provider
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

    // Create mock MCP client with executeToolByName for testing
    mockMCPClient = {
      getTools: vi.fn().mockReturnValue([
        {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {},
        },
      ]),
      executeTool: vi.fn(),
      connect: vi.fn(),
      connectToServers: vi.fn(),
      disconnect: vi.fn(),
      executeToolByName: vi.fn(),
      getToolByName: vi.fn(),
      getToolDefinitions: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      listResources: vi.fn(),
      readResource: vi.fn(),
      listPrompts: vi.fn(),
      getPrompt: vi.fn(),
    } as unknown as MCPClient & { executeToolByName: ReturnType<typeof vi.fn> };

    // Create agent instance
    agent = await createAgent({
      provider: mockProvider,
      mcpClient: mockMCPClient,
    });
  });

  describe('Agent Creation', () => {
    test('should create agent with required interfaces', () => {
      expect(agent).toHaveProperty('processQuery');
      expect(agent).toHaveProperty('getMessages');
      expect(agent).toHaveProperty('clearHistory');
      expect(agent).toHaveProperty('mcpClient');
      expect(agent).toHaveProperty('provider');
      expect(agent).toHaveProperty('getContextUsage');
    });
  });

  describe('Message Management', () => {
    test('should maintain message history', async () => {
      const mockResponse = {
        type: 'text',
        content: 'Test response',
        isComplete: true,
        usage: {
          promptTokens: 100,
          completionTokens: 100,
          totalTokens: 200,
        },
      };

      (mockProvider.complete as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        yield mockResponse;
      });

      const query = 'Test query';
      const messages = [];

      for await (const message of agent.processQuery(query)) {
        messages.push(message);
      }

      expect(messages.length).toBeGreaterThan(0);
      expect(agent.getMessages().length).toBeGreaterThan(0);
    });
  });

  describe('Tool Execution', () => {
    test('should handle tool requests and responses', async () => {
      const mockToolResponse = { content: 'Tool execution result', isError: false };
      (mockMCPClient.executeTool as ReturnType<typeof vi.fn>).mockResolvedValue(mockToolResponse);

      const mockProviderResponses = [
        {
          type: 'tool_request',
          tool: 'test_tool',
          parameters: {},
          isComplete: true,
          content: 'Requesting test tool',
        },
        {
          type: 'text',
          content: 'Final response after tool execution',
          isComplete: true,
        },
      ];

      let responseIndex = 0;
      (mockProvider.complete as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        while (responseIndex < mockProviderResponses.length) {
          yield {
            ...mockProviderResponses[responseIndex++],
            usage: {
              promptTokens: 100,
              completionTokens: 100,
              totalTokens: 200,
            },
          };
        }
      });

      const messages = [];
      for await (const message of agent.processQuery('Use test tool')) {
        messages.push(message);
      }

      expect(messages.some((m) => m.type === 'tool_request')).toBe(true);
      expect(messages.some((m) => m.type === 'tool_response')).toBe(true);
      expect(mockMCPClient.executeTool).toHaveBeenCalledWith('test_tool', {});
    });

    test('should handle tool execution errors', async () => {
      const mockToolResponse = {
        content: 'Tool execution failed',
        error: 'Tool error',
        isError: true,
      };
      (mockMCPClient.executeTool as ReturnType<typeof vi.fn>).mockResolvedValue(mockToolResponse);

      const mockProviderResponses = [
        {
          type: 'tool_request',
          tool: 'test_tool',
          parameters: {},
          isComplete: true,
          content: 'Requesting test tool',
        },
        {
          type: 'text',
          content: 'Final response after tool error',
          isComplete: true,
        },
      ];

      let responseIndex = 0;
      (mockProvider.complete as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        while (responseIndex < mockProviderResponses.length) {
          yield {
            ...mockProviderResponses[responseIndex++],
            usage: {
              promptTokens: 100,
              completionTokens: 100,
              totalTokens: 200,
            },
          };
        }
      });

      const messages = [];
      for await (const message of agent.processQuery('Use test tool')) {
        messages.push(message);
      }

      const toolResponseMessage = messages.find((m) => m.type === 'tool_response');
      expect(toolResponseMessage).toBeDefined();
      expect(toolResponseMessage?.error).toBeDefined();
    });
  });

  describe('Context Usage', () => {
    test('should calculate context usage correctly', async () => {
      const result = await agent.getContextUsage([
        {
          id: randomUUID(),
          role: 'user',
          type: 'text',
          content: 'Test message',
          createdAt: new Date().toISOString(),
        },
      ]);

      expect(result).toEqual({
        usedTokens: 100,
        maxTokens: 4000,
        percentage: 2.5,
      });
      expect(mockProvider.getContextUsage).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle tool execution errors gracefully', async () => {
      // First response requests a tool
      (mockProvider.complete as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        yield {
          type: 'tool_request',
          tool: 'test_tool',
          parameters: {},
          isComplete: true,
          content: 'Requesting test tool',
          usage: {
            promptTokens: 100,
            completionTokens: 100,
            totalTokens: 200,
          },
        };
      });

      // Tool execution throws an error
      (mockMCPClient.executeTool as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Tool execution error')
      );

      const messages = [];
      for await (const message of agent.processQuery('Test query with tool error')) {
        messages.push(message);
      }

      const toolResponseMessage = messages.find((m) => m.type === 'tool_response');
      expect(toolResponseMessage).toBeDefined();
      expect(toolResponseMessage?.error).toBeDefined();
    });
  });
});
