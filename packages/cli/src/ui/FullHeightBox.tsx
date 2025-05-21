import { Box, useStdout } from 'ink';
import React, { ReactNode, useEffect, useState } from 'react';

type FullHeightBoxProps = {
  children: ReactNode;
};

/**
 * A container component that adjusts to the full height of the terminal
 */
export const FullHeightBox = ({ children }: FullHeightBoxProps): React.ReactElement => {
  const { stdout } = useStdout();
  const [minHeight, setMinHeight] = useState(process.stdout.rows);

  useEffect(() => {
    // Get initial dimensions
    setMinHeight(stdout.rows);

    // Handle terminal resize
    const handleResize = (): void => {
      setMinHeight(stdout.rows);
    };

    // Add event listener for resize
    stdout.on('resize', handleResize);

    // Clean up event listener
    return (): void => {
      stdout.removeListener('resize', handleResize);
    };
  }, [stdout]);

  return (
    <Box minHeight={minHeight} flexDirection="column">
      {children}
    </Box>
  );
};

export default FullHeightBox;
