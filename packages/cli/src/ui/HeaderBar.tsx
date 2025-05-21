import { Box, Text } from 'ink';
import React from 'react';

const getModelInfo = (): {
  provider: string;
  model: string;
  temperature: string;
} => {
  const provider = process.env.PROVIDER || '';
  const temperature = process.env.TEMPERATURE || '';
  const model = process.env[`${provider.toUpperCase().replace(/-/g, '_')}_MODEL`] || '';

  return {
    provider,
    model,
    temperature,
  };
};

const HeaderBar: React.FC = () => {
  const { provider, model, temperature } = getModelInfo();

  return (
    <Box margin={1} justifyContent="space-between">
      <Box>
        <Text bold color="blue" inverse>
          {' '}
          Artie{' '}
        </Text>
      </Box>
      {provider && model && temperature && (
        <Box>
          <Text dimColor>
            {provider}: {model} @ {temperature}
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default HeaderBar;
