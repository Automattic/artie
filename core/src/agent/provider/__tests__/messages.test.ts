import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  convertToProviderMessages,
  createMessageFromResponse,
  createUserMessage,
  createSystemMessage,
  createErrorMessage,
  createFormattedResponse,
} from '../messages.js';
import type { Message, AgentProviderResponse, QueuedToolRequest } from '../../types.js';
import { randomUUID } from 'crypto';

// Mock crypto.randomUUID to ensure predictable IDs for tests
vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid-123'),
}));

describe('Message Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock Date.now() to ensure consistent timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('convertToProviderMessages', () => {
    it('should convert text messages correctly', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          type: 'text',
          content: 'Hello world',
          createdAt: '2023-01-01T00:00:00.000Z',
          isComplete: true,
        },
        {
          id: '2',
          role: 'assistant',
          type: 'text',
          content: 'Hi there!',
          createdAt: '2023-01-01T00:00:01.000Z',
          isComplete: true,
        },
      ];

      const providerMessages = convertToProviderMessages(messages);

      expect(providerMessages).toEqual([
        { role: 'user', content: 'Hello world' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
    });

    it('should convert tool response messages to user role', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'tool',
          type: 'tool_response',
          tool: 'search',
          content: 'Search results for query',
          createdAt: '2023-01-01T00:00:00.000Z',
          isComplete: true,
        },
      ];

      const providerMessages = convertToProviderMessages(messages);

      expect(providerMessages).toEqual([
        {
          role: 'user',
          content: '[TOOL RESULT] Tool "search" returned: Search results for query',
        },
      ]);
    });

    it('should format tool error responses correctly', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'tool',
          type: 'tool_response',
          tool: 'search',
          error: 'API limit exceeded',
          createdAt: '2023-01-01T00:00:00.000Z',
          isComplete: true,
        },
      ];

      const providerMessages = convertToProviderMessages(messages);

      expect(providerMessages).toEqual([
        {
          role: 'user',
          content: '[TOOL ERROR] Tool "search" execution failed: API limit exceeded',
        },
      ]);
    });

    it('should filter out empty messages', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          type: 'text',
          content: '',
          createdAt: '2023-01-01T00:00:00.000Z',
          isComplete: true,
        },
        {
          id: '2',
          role: 'assistant',
          type: 'text',
          content: 'Hello',
          createdAt: '2023-01-01T00:00:01.000Z',
          isComplete: true,
        },
        {
          id: '3',
          role: 'user',
          type: 'text',
          content: '   ',
          createdAt: '2023-01-01T00:00:02.000Z',
          isComplete: true,
        },
      ];

      const providerMessages = convertToProviderMessages(messages);

      expect(providerMessages).toEqual([{ role: 'assistant', content: 'Hello' }]);
    });

    it('should filter out tool request messages', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'assistant',
          type: 'tool_request',
          tool: 'search',
          parameters: { query: 'test' },
          createdAt: '2023-01-01T00:00:00.000Z',
          isComplete: true,
        },
        {
          id: '2',
          role: 'assistant',
          type: 'text',
          content: 'Let me search that for you',
          createdAt: '2023-01-01T00:00:01.000Z',
          isComplete: true,
        },
      ];

      const providerMessages = convertToProviderMessages(messages);

      expect(providerMessages).toEqual([
        { role: 'assistant', content: 'Let me search that for you' },
      ]);
    });
  });

  describe('createMessageFromResponse', () => {
    it('should create a text message from a text response', () => {
      const response: AgentProviderResponse = {
        type: 'text',
        content: 'Hello world',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      };

      const message = createMessageFromResponse(response);

      expect(message).toEqual({
        id: 'test-uuid-123',
        role: 'assistant',
        type: 'text',
        content: 'Hello world',
        createdAt: '2023-01-01T00:00:00.000Z',
        tool: undefined,
        parameters: undefined,
        error: undefined,
      });
      expect(randomUUID).toHaveBeenCalledTimes(1);
    });

    it('should create a tool request message with metadata', () => {
      const response: AgentProviderResponse = {
        type: 'tool_request',
        tool: 'search',
        parameters: { query: 'test' },
        toolMetadata: { description: 'Search the web for information' },
        usage: {
          promptTokens: 15,
          completionTokens: 10,
          totalTokens: 25,
        },
      };

      const message = createMessageFromResponse(response);

      expect(message).toEqual({
        id: 'test-uuid-123',
        role: 'assistant',
        type: 'tool_request',
        tool: 'search',
        parameters: { query: 'test' },
        toolMetadata: { description: 'Search the web for information' },
        createdAt: '2023-01-01T00:00:00.000Z',
        content: undefined,
        error: undefined,
      });
    });

    it('should create a tool response message', () => {
      const response: AgentProviderResponse = {
        type: 'tool_response',
        tool: 'search',
        content: 'Search results',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };

      const message = createMessageFromResponse(response);

      expect(message).toEqual({
        id: 'test-uuid-123',
        role: 'assistant',
        type: 'tool_response',
        tool: 'search',
        content: 'Search results',
        createdAt: '2023-01-01T00:00:00.000Z',
        parameters: undefined,
        error: undefined,
      });
    });

    it('should include error information when present', () => {
      const response: AgentProviderResponse = {
        type: 'tool_response',
        tool: 'search',
        error: 'API limit exceeded',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };

      const message = createMessageFromResponse(response);

      expect(message).toEqual({
        id: 'test-uuid-123',
        role: 'assistant',
        type: 'tool_response',
        tool: 'search',
        error: 'API limit exceeded',
        createdAt: '2023-01-01T00:00:00.000Z',
        content: undefined,
        parameters: undefined,
      });
    });
  });

  describe('createUserMessage', () => {
    it('should create a user message with the provided content', () => {
      const message = createUserMessage('Hello world');

      expect(message).toEqual({
        id: 'test-uuid-123',
        role: 'user',
        type: 'text',
        content: 'Hello world',
        createdAt: '2023-01-01T00:00:00.000Z',
        isComplete: true,
      });
      expect(randomUUID).toHaveBeenCalledTimes(1);
    });
  });

  describe('createSystemMessage', () => {
    it('should create a system message with the provided content', () => {
      const message = createSystemMessage('System instruction');

      expect(message).toEqual({
        id: 'test-uuid-123',
        role: 'system',
        type: 'text',
        content: 'System instruction',
        createdAt: '2023-01-01T00:00:00.000Z',
        isComplete: true,
      });
      expect(randomUUID).toHaveBeenCalledTimes(1);
    });
  });

  describe('createErrorMessage', () => {
    it('should create an error message with Error object', () => {
      const error = new Error('Something went wrong');
      const message = createErrorMessage(error);

      expect(message).toEqual({
        id: 'test-uuid-123',
        role: 'system',
        type: 'text',
        content: 'Agent error: Something went wrong',
        createdAt: '2023-01-01T00:00:00.000Z',
        isComplete: true,
      });
    });

    it('should create an error message with string error', () => {
      const message = createErrorMessage('API failure');

      expect(message).toEqual({
        id: 'test-uuid-123',
        role: 'system',
        type: 'text',
        content: 'Agent error: Unknown error',
        createdAt: '2023-01-01T00:00:00.000Z',
        isComplete: true,
      });
    });

    it('should include tool information when provided', () => {
      const error = new Error('Tool execution failed');
      const request: QueuedToolRequest = {
        id: 'req-123',
        tool: 'search',
        parameters: { query: 'test' },
      };

      const message = createErrorMessage(error, request);

      expect(message).toEqual({
        id: 'test-uuid-123',
        role: 'system',
        type: 'text',
        content: 'Agent error with tool search: Tool execution failed',
        createdAt: '2023-01-01T00:00:00.000Z',
        isComplete: true,
      });
    });

    it('should handle unknown error types', () => {
      const message = createErrorMessage(undefined);

      expect(message.content).toBe('Agent error: Unknown error');
    });
  });

  describe('createFormattedResponse', () => {
    it('should format null or undefined content', () => {
      const response1 = createFormattedResponse('test-tool', null);
      const response2 = createFormattedResponse('test-tool', undefined);

      expect(response1).toContain(
        '[TOOL RESULT] Tool "test-tool" was executed but returned NULL/UNDEFINED'
      );
      expect(response2).toContain(
        '[TOOL RESULT] Tool "test-tool" was executed but returned NULL/UNDEFINED'
      );
    });

    it('should format string content', () => {
      const response = createFormattedResponse('test-tool', 'Hello world');

      expect(response).toBe('[TOOL RESULT] Tool "test-tool" returned: Hello world');
    });

    it('should handle empty string content', () => {
      const response = createFormattedResponse('test-tool', '');

      expect(response).toContain(
        '[TOOL RESULT] Tool "test-tool" was executed successfully but returned an EMPTY STRING'
      );
    });

    it('should handle whitespace-only string content', () => {
      const response = createFormattedResponse('test-tool', '   ');

      expect(response).toContain(
        '[TOOL RESULT] Tool "test-tool" was executed successfully but returned an EMPTY STRING'
      );
    });

    it('should parse and format JSON string content', () => {
      const jsonString = JSON.stringify({ result: 'success', code: 200 });
      const response = createFormattedResponse('test-tool', jsonString);

      expect(response).toContain('"result": "success"');
      expect(response).toContain('"code": 200');
    });

    it('should handle unparseable JSON strings as regular strings', () => {
      const invalidJson = '{ "broken": true,';
      const response = createFormattedResponse('test-tool', invalidJson);

      expect(response).toBe('[TOOL RESULT] Tool "test-tool" returned: { "broken": true,');
    });

    it('should format objects and arrays with indentation', () => {
      const obj = { a: 1, b: { c: 2 } };
      const response = createFormattedResponse('test-tool', obj);

      expect(response).toContain('"a": 1');
      expect(response).toContain('"b": {');
      expect(response).toContain('"c": 2');
    });

    it('should handle arrays with text content', () => {
      const arr = [{ text: 'Result from API' }];
      const response = createFormattedResponse('test-tool', arr);

      expect(response).toBe('[TOOL RESULT] Tool "test-tool" returned: Result from API');
    });

    it('should handle arrays without text properties', () => {
      const arr = [{ id: 1, value: 'test' }];
      const response = createFormattedResponse('test-tool', arr);

      expect(response).toContain('"id": 1');
      expect(response).toContain('"value": "test"');
    });

    it('should handle errors in the formatting process', () => {
      // Create an object that will cause JSON.stringify to fail
      const circular: any = {};
      circular.self = circular;

      // Mock JSON.stringify to throw
      const originalStringify = JSON.stringify;
      JSON.stringify = vi.fn().mockImplementation(() => {
        throw new Error('Cannot stringify circular structure');
      });

      const response = createFormattedResponse('test-tool', circular);

      // Restore original function
      JSON.stringify = originalStringify;

      expect(response).toContain(
        '[TOOL RESULT] Tool "test-tool" was executed and completed with an unprocessable result'
      );
    });
  });
});
