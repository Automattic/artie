import { useCallback, useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAppContext } from '../context/AppContext.js';
import type { Message } from '@artie/core';

export const useChat = (): {
  messages: Message[];
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  input: string;
  setInput: (input: string) => void;
  history: string[];
  navigateHistoryUp: () => void;
  navigateHistoryDown: () => void;
  addUserMessage: (content: string) => string;
  addAssistantMessage: (content: string) => string;
  addToolRequestMessage: (
    tool: string,
    parameters: Record<string, unknown>,
    toolMetadata?: { description?: string }
  ) => string;
  updateMessageContent: (id: string, content: string) => void;
  updateToolMessage: (
    id: string,
    result: { isError: boolean; content?: unknown; error?: string }
  ) => void;
} => {
  const { state, actions } = useAppContext();
  const { messages } = state;
  const { addMessage, updateMessage, setIsLoading } = actions;
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Wrap setInput to add logging
  const setInputWithLogging = useCallback((newInput: string) => {
    setInput(newInput);
  }, []);

  // Add a user message to the chat
  const addUserMessage = useCallback(
    (content: string): string => {
      const id = uuidv4();
      const message: Message = {
        id,
        role: 'user',
        type: 'text',
        content,
        createdAt: new Date().toISOString(),
      };
      addMessage(message);

      // Add to history
      setHistory((prev) => {
        // Only add if it's not the same as the last entry
        if (prev.length === 0 || prev[prev.length - 1] !== content) {
          return [...prev, content];
        }
        return prev;
      });

      // Reset history index
      setHistoryIndex(-1);

      return id;
    },
    [addMessage]
  );

  // Add an assistant message to the chat
  const addAssistantMessage = useCallback(
    (content: string): string => {
      const id = uuidv4();
      const message: Message = {
        id,
        role: 'assistant',
        type: 'text',
        content,
        createdAt: new Date().toISOString(),
      };
      addMessage(message);
      return id;
    },
    [addMessage]
  );

  // Add a tool request message to the chat
  const addToolRequestMessage = useCallback(
    (
      tool: string,
      parameters: Record<string, unknown>,
      toolMetadata?: { description?: string }
    ): string => {
      const id = uuidv4();
      const message: Message = {
        id,
        role: 'assistant',
        type: 'tool_request',
        tool,
        parameters,
        createdAt: new Date().toISOString(),
        toolMetadata, // Use the passed toolMetadata if available
      };
      addMessage(message);
      return id;
    },
    [addMessage]
  );

  // Update a message's content
  const updateMessageContent = useCallback(
    (id: string, content: string): void => {
      updateMessage(id, { content });
    },
    [updateMessage]
  );

  // Update a tool message with result or error
  const updateToolMessage = useCallback(
    (id: string, result: { isError: boolean; content?: unknown; error?: string }): void => {
      // Create a new tool response message instead of updating the request
      const toolResponseMsg: Partial<Message> = {
        id: uuidv4(),
        type: 'tool_response',
        role: 'tool',
        tool: messages.find((m) => m.id === id)?.tool,
        content: result.isError ? undefined : (result.content as string | undefined),
        error: result.isError ? result.error : undefined,
        createdAt: new Date().toISOString(),
      };

      // Add the response as a new message
      addMessage(toolResponseMsg as Message);
    },
    [addMessage, messages]
  );

  // Navigate history up (older messages)
  const navigateHistoryUp = useCallback(() => {
    if (history.length === 0) return;

    const newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
    setHistoryIndex(newIndex);
    setInput(history[history.length - 1 - newIndex]);
  }, [history, historyIndex]);

  // Navigate history down (newer messages)
  const navigateHistoryDown = useCallback(() => {
    if (historyIndex <= 0) {
      setHistoryIndex(-1);
      setInput('');
      return;
    }

    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setInput(history[history.length - 1 - newIndex]);
  }, [history, historyIndex]);

  // Return memoized values to prevent unnecessary re-renders
  return useMemo(
    () => ({
      messages,
      isLoading: state.isLoading,
      setIsLoading,
      input,
      setInput: setInputWithLogging,
      history,
      navigateHistoryUp,
      navigateHistoryDown,
      addUserMessage,
      addAssistantMessage,
      addToolRequestMessage,
      updateMessageContent,
      updateToolMessage,
    }),
    [
      messages,
      state.isLoading,
      setIsLoading,
      input,
      setInputWithLogging,
      history,
      navigateHistoryUp,
      navigateHistoryDown,
      addUserMessage,
      addAssistantMessage,
      addToolRequestMessage,
      updateMessageContent,
      updateToolMessage,
    ]
  );
};
