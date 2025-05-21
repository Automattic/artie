import React from 'react';
import { Box, Text } from 'ink';
import { Message } from '@artie/core';
import Spinner from 'ink-spinner';

export interface ToolExecutionProps {
  message: Message;
  isCompleted: boolean;
}

export default function ToolExecution({
  message,
  isCompleted,
}: ToolExecutionProps): React.ReactElement {
  // Use the content field if available (for stored tool requests)
  // Otherwise generate a description from toolMetadata or tool name
  const description =
    message.content ||
    message.toolMetadata?.description ||
    (message.tool ? `${isCompleted ? 'Completed' : 'Running'}: ${message.tool}` : 'Tool execution');

  return (
    <Box
      flexShrink={0}
      marginX={1}
      paddingX={1}
      borderStyle="round"
      borderColor={isCompleted ? 'grey' : 'blue'}
    >
      {isCompleted ? (
        <Text color="white" dimColor>
          ✓ {description}
        </Text>
      ) : (
        <Text color="blue">
          <Spinner type="dots" /> {description}
        </Text>
      )}
    </Box>
  );
}
