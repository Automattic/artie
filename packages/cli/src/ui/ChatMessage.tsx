import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import React, { useEffect, useState } from 'react';
import type { ChatMessageView } from './types.js';

import SimpleMarkdown from './SimpleMarkdown.js';

type ChatMessageProps = ChatMessageView;

const ChatMessage: React.FC<ChatMessageProps> = ({ role, content, isLoading = false }) => {
  const [displayContent, setDisplayContent] = useState(content);

  // Clean tool calls from content when it changes
  useEffect(() => {
    setDisplayContent(content);
  }, [content, role]);

  return (
    <Box
      flexDirection="column"
      marginY={1}
      marginLeft={1}
      paddingRight={5}
      paddingLeft={1}
      borderLeftColor={role === 'user' ? 'green' : 'blue'}
      borderStyle="bold"
      borderTop={false}
      borderBottom={false}
      borderRight={false}
    >
      <Box>
        <Text bold color={role === 'user' ? 'green' : 'blue'}>
          {role === 'user' ? 'You: ' : 'Artie: '}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <Box flexGrow={1}>
          {role === 'assistant' ? (
            <>
              {displayContent && <SimpleMarkdown>{displayContent}</SimpleMarkdown>}
              {!displayContent && isLoading && <Spinner type="dots" />}
            </>
          ) : (
            <Text wrap="wrap">{displayContent}</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default ChatMessage;
