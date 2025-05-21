import type { Message } from '@artie/core';

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isLoading?: boolean;
}

export interface ToolExecutionView {
  id: string;
  toolName: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  isExecuting: boolean;
}

export type MessageView = ChatMessageView | ToolExecutionView;

export const messageToView = (message: Message): MessageView => {
  if (message.type === 'tool_request') {
    return {
      id: message.id,
      toolName: message.tool || '',
      params: message.parameters || {},
      isExecuting: true,
    };
  } else if (message.type === 'tool_response') {
    return {
      id: message.id,
      toolName: message.tool || '',
      params: message.parameters || {},
      result: message.content,
      error: message.error,
      isExecuting: false,
    };
  } else {
    return {
      id: message.id,
      role: message.role === 'system' || message.role === 'tool' ? 'assistant' : message.role,
      content: message.content || '',
    };
  }
};
