import { Box, Text } from 'ink';
import React from 'react';

interface ChatHistoryProps {
  messages: Array<{ role: string; content: string }>;
  isLoading?: boolean;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, isLoading = false }) => {
  // Format messages for display in the terminal
  return (
    <Box flexDirection="column" flexGrow={1}>
      {messages.map((message, index) => (
        <Box key={index} flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color={message.role === 'user' ? 'green' : 'blue'}>
              {message.role === 'user' ? 'You: ' : 'Artie: '}
            </Text>
          </Box>
          <Box paddingLeft={2} flexDirection="column">
            <Text wrap="wrap">{message.content}</Text>
          </Box>
        </Box>
      ))}

      {/* Show loading indicator for assistant response */}
      {isLoading && (
        <Box key="loading" flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color="blue">
              Artie:{' '}
            </Text>
          </Box>
          <Box paddingLeft={2}>
            <Text>Thinking...</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default ChatHistory;
