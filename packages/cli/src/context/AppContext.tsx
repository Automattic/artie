import React, { createContext, useContext, useReducer, useMemo } from 'react';
import type { Message } from '@artie/core';
import type { MessageView } from '../ui/types.js';
import { messageToView } from '../ui/types.js';

// Re-export the core Message type
export type { Message };

// State type
type AppState = {
  agent: any | null;
  error: string | null;
  isLoading: boolean;
  messages: Message[];
  messageViews: MessageView[];
  cancelToken: AbortController | null;
  connectedMCPServers: string[];
  mcpServerNames: string[];
};

// Action types
type AppAction =
  | { type: 'SET_AGENT'; payload: any }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_IS_LOADING'; payload: boolean }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<Message> } }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_CANCEL_TOKEN'; payload: AbortController | null }
  | { type: 'SET_CONNECTED_MCP_SERVERS'; payload: string[] }
  | { type: 'SET_MCP_SERVER_NAMES'; payload: string[] };

// Initial state
const initialState: AppState = {
  agent: null,
  error: null,
  isLoading: false,
  messages: [],
  messageViews: [],
  cancelToken: null,
  connectedMCPServers: [],
  mcpServerNames: [],
};

// Reducer
const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_AGENT':
      return { ...state, agent: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_IS_LOADING':
      return { ...state, isLoading: action.payload };
    case 'ADD_MESSAGE': {
      const messages = [...state.messages, action.payload];
      return {
        ...state,
        messages,
        messageViews: messages.map(messageToView),
      };
    }
    case 'UPDATE_MESSAGE': {
      const messages = state.messages.map((message) => {
        return message.id === action.payload.id
          ? { ...message, ...action.payload.updates }
          : message;
      });
      return {
        ...state,
        messages,
        messageViews: messages.map(messageToView),
      };
    }
    case 'CLEAR_MESSAGES':
      return { ...state, messages: [], messageViews: [] };
    case 'SET_CANCEL_TOKEN':
      return { ...state, cancelToken: action.payload };
    case 'SET_CONNECTED_MCP_SERVERS':
      return { ...state, connectedMCPServers: action.payload };
    case 'SET_MCP_SERVER_NAMES':
      return { ...state, mcpServerNames: action.payload };
    default:
      return state;
  }
};

// Context
type AppContextType = {
  state: AppState;
  actions: {
    setAgent: (agent: any) => void;
    setError: (error: string | null) => void;
    setIsLoading: (isLoading: boolean) => void;
    addMessage: (message: Message) => void;
    updateMessage: (id: string, updates: Partial<Message>) => void;
    clearMessages: () => void;
    setCancelToken: (token: AbortController | null) => void;
    setConnectedMCPServers: (servers: string[]) => void;
    setMCPServerNames: (names: string[]) => void;
  };
};

const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider
type AppProviderProps = {
  children: React.ReactNode;
  initialServerNames?: string[];
};

export const AppProvider: React.FC<AppProviderProps> = ({ children, initialServerNames = [] }) => {
  const [state, dispatch] = useReducer(appReducer, {
    ...initialState,
    mcpServerNames: initialServerNames,
  });

  const actions = useMemo(
    () => ({
      setAgent: (agent: any): void => dispatch({ type: 'SET_AGENT', payload: agent }),
      setError: (error: string | null): void => dispatch({ type: 'SET_ERROR', payload: error }),
      setIsLoading: (isLoading: boolean): void =>
        dispatch({ type: 'SET_IS_LOADING', payload: isLoading }),
      addMessage: (message: Message): void => dispatch({ type: 'ADD_MESSAGE', payload: message }),
      updateMessage: (id: string, updates: Partial<Message>): void =>
        dispatch({ type: 'UPDATE_MESSAGE', payload: { id, updates } }),
      clearMessages: (): void => dispatch({ type: 'CLEAR_MESSAGES' }),
      setCancelToken: (token: AbortController | null): void =>
        dispatch({ type: 'SET_CANCEL_TOKEN', payload: token }),
      setConnectedMCPServers: (servers: string[]): void =>
        dispatch({ type: 'SET_CONNECTED_MCP_SERVERS', payload: servers }),
      setMCPServerNames: (names: string[]): void =>
        dispatch({ type: 'SET_MCP_SERVER_NAMES', payload: names }),
    }),
    []
  );

  const contextValue = useMemo(() => ({ state, actions }), [state, actions]);

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};

// Hook
export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
