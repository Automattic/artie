import { Box, Text } from 'ink';
import React from 'react';
import { useAppContext } from '../context/AppContext.js';
import { useTokenUsage } from '../hooks/useTokenUsage.js';

const FooterBar: React.FC = () => {
  const { state } = useAppContext();
  const { connectedMCPServers } = state;
  const { percentage, usedTokens, maxTokens, loading } = useTokenUsage();

  // Determine color based on percentage
  const getUsageColor = (pct: number): string => {
    if (pct > 90) return 'red';
    return 'gray';
  };

  return (
    <Box justifyContent="space-between" paddingX={1} marginX={1}>
      <Box>
        {!loading && (
          <Text color={getUsageColor(percentage)}>
            Context: {percentage}% ({usedTokens}/{maxTokens})
          </Text>
        )}
      </Box>
      <Box>
        {connectedMCPServers.length > 0 && (
          <Text color="gray">MCPs: {connectedMCPServers.join(', ')}</Text>
        )}
      </Box>
    </Box>
  );
};

export default FooterBar;
