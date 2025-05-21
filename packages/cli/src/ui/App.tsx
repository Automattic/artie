import { Box, Text, useInput } from 'ink';
import React, { useCallback, useEffect, useState, useRef } from 'react';

import { useAppContext } from '../context/AppContext.js';
import { useAgent } from '../hooks/useAgent.js';
import { useChat } from '../hooks/useChat.js';
import { cleanExit, isExiting } from '../utils/processUtils.js';
import { useLogging, LogProvider } from '../utils/logging.js';

import ChatMessage from './ChatMessage.js';
import FullHeightBox from './FullHeightBox.js';
import HeaderBar from './HeaderBar.js';
import InputField from './InputField.js';
import FooterBar from './FooterBar.js';
import ToolExecution from './ToolExecution.js';

// Create a LogDisplay component
const LogDisplay: React.FC = () => {
  const { logs } = useLogging();

  if (logs.length === 0) return null;

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1} marginY={1}>
      <Text color="yellow">Logs:</Text>
      {logs.map((log, index) => (
        <Text key={index} color="white" dimColor>
          {log}
        </Text>
      ))}
    </Box>
  );
};

const App: React.FC = () => {
  const { state, actions } = useAppContext();
  const { agent, error, messages, isLoading } = state;
  const { sendMessage, cleanup, initAgent, cancelRequest } = useAgent();
  const { input, setInput, navigateHistoryUp, navigateHistoryDown } = useChat();
  // Track if the agent is still initializing (MCP servers loading)
  const [isAgentInitializing, setIsAgentInitializing] = useState(true);
  // Flag to prevent multiple message loading
  const hasLoadedInitialMessages = useRef(false);

  // Initialize agent on mount
  useEffect(() => {
    const init = async (): Promise<void> => {
      setIsAgentInitializing(true);
      await initAgent();
      setIsAgentInitializing(false);
    };
    void init();
  }, [initAgent]);

  // Load previous messages from agent after initialization
  useEffect(() => {
    // Only run this once after agent is initialized
    if (!isAgentInitializing && agent && !hasLoadedInitialMessages.current) {
      // Get messages from agent
      const agentMessages = agent.getMessages();

      // Add messages to state if they're not already there
      if (agentMessages.length > 0 && messages.length === 0) {
        // Add each message in order to maintain conversation flow
        agentMessages.forEach((message) => {
          // don't display any system messages
          if (message.role === 'system') return;

          actions.addMessage(message);
        });
      }

      // Mark as loaded to prevent reloading on re-renders
      hasLoadedInitialMessages.current = true;
    }
  }, [agent, isAgentInitializing, messages.length, actions]);

  // Clean up resources when component unmounts
  useEffect(() => {
    return (): void => {
      cleanup();
    };
  }, [cleanup]);

  // Handle keyboard input
  useInput((input, key) => {
    // Handle escape key first - it should work even when input is disabled
    if (key.escape && isLoading) {
      cancelRequest();
      return;
    }

    // Handle Ctrl+C to exit gracefully
    if (key.ctrl && input === 'c' && !isExiting()) {
      cleanup();
      cleanExit(0);
      return;
    }

    // Only handle other inputs if not loading
    if (!isLoading && key.return && input.trim()) {
      void handleSubmit(input);
    }
  });

  // Handle input submission
  const handleSubmit = useCallback(
    async (value: string) => {
      if (!value.trim()) return;

      void sendMessage(value);
      setInput('');
    },
    [sendMessage, setInput]
  );

  return (
    <LogProvider>
      <FullHeightBox>
        <Box flexDirection="column" height="100%">
          {/* Header */}
          <HeaderBar />

          {/* Logs */}
          <LogDisplay />

          {/* Messages */}
          <Box flexDirection="column" flexGrow={1} minHeight={10} justifyContent="flex-end">
            {error && (
              <Box marginY={1} paddingX={2} paddingY={1} borderStyle="round" borderColor="red">
                <Text bold color="red">
                  Error:{' '}
                </Text>
                <Text color="redBright">{error}</Text>
              </Box>
            )}

            {messages.map((message, index) => {
              // Don't show formatted tool responses - that message will be shown as regular text
              if (message.type === 'tool_response') {
                // We'll handle this in the tool_request display
                return null;
              }

              if (message.type === 'tool_request') {
                // For tool requests loaded from storage, consider them already completed
                // if they have a content field (which we added earlier)
                const isStoredToolRequest = !!message.content;

                // For stored tool requests, mark them as completed and use content
                // for display instead of parameters
                return (
                  <ToolExecution
                    key={index}
                    message={message}
                    isCompleted={isStoredToolRequest || messages.length - 1 > index + 2}
                  />
                );
              }

              return (
                <ChatMessage
                  id={message.id}
                  key={index}
                  role={
                    message.role === 'system' || message.role === 'tool'
                      ? 'assistant'
                      : message.role
                  }
                  content={message.content || ''}
                  isLoading={message.id === messages[messages.length - 1]?.id && isLoading}
                />
              );
            })}
          </Box>

          {/* Status and Input */}
          <Box flexDirection="column" marginTop={1} flexShrink={0}>
            <FooterBar />
            <InputField
              value={input}
              onChange={setInput}
              onSubmit={(value: string): void => {
                void handleSubmit(value);
              }}
              onHistoryUp={navigateHistoryUp}
              onHistoryDown={navigateHistoryDown}
              placeholder={isLoading ? 'Press [esc] to cancel...' : 'Type a message or command...'}
              disabled={isLoading || isAgentInitializing}
            />
          </Box>
        </Box>
      </FullHeightBox>
    </LogProvider>
  );
};

export default App;
