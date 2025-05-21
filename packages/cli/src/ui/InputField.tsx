import { Box, Text, useInput } from 'ink';
import React, { useState, useEffect, useCallback, memo } from 'react';

export interface InputFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onHistoryUp?: () => void;
  onHistoryDown?: () => void;
}

const InputField: React.FC<InputFieldProps> = memo(
  ({
    value,
    onChange,
    onSubmit,
    placeholder = 'Type here...',
    disabled = false,
    onHistoryUp,
    onHistoryDown,
  }) => {
    const [cursorPosition, setCursorPosition] = useState(value.length);
    const [localValue, setLocalValue] = useState(value);

    // Update cursor position and local value when value changes externally
    useEffect(() => {
      setLocalValue(value);
      setCursorPosition(value.length);
    }, [value]);

    // Handle input submission
    const handleSubmit = useCallback(() => {
      if (localValue.trim()) {
        onSubmit(localValue);
      }
    }, [localValue, onSubmit]);

    // Handle value change
    const handleChange = useCallback(
      (newValue: string) => {
        setLocalValue(newValue);
        onChange(newValue);
      },
      [onChange]
    );

    // Handle keyboard input - memoize the callback
    const handleKeyInput = useCallback(
      (input: string, key: any) => {
        // Skip input processing when disabled
        if (disabled) return;

        if (key.return) {
          handleSubmit();
          return;
        }

        if (key.backspace || key.delete) {
          if (cursorPosition > 0) {
            const newValue =
              localValue.slice(0, cursorPosition - 1) + localValue.slice(cursorPosition);
            handleChange(newValue);
            setCursorPosition(cursorPosition - 1);
          }
        } else if (key.leftArrow) {
          if (cursorPosition > 0) {
            setCursorPosition(cursorPosition - 1);
          }
        } else if (key.rightArrow) {
          if (cursorPosition < localValue.length) {
            setCursorPosition(cursorPosition + 1);
          }
        } else if (key.upArrow && onHistoryUp) {
          // Navigate history up
          onHistoryUp();
        } else if (key.downArrow && onHistoryDown) {
          // Navigate history down
          onHistoryDown();
        } else if (input === '\u0001') {
          // Ctrl+A (beginning of line)
          setCursorPosition(0);
        } else if (input === '\u0005') {
          // Ctrl+E (end of line)
          setCursorPosition(localValue.length);
        } else if (!key.ctrl && !key.meta && input) {
          // Regular character input
          const newValue =
            localValue.slice(0, cursorPosition) + input + localValue.slice(cursorPosition);
          handleChange(newValue);
          setCursorPosition(cursorPosition + input.length);
        }
      },
      [cursorPosition, localValue, handleChange, handleSubmit, disabled, onHistoryUp, onHistoryDown]
    );

    // Use the memoized keyboard input handler
    useInput(handleKeyInput);

    // Render input field with cursor
    return (
      <Box flexDirection="column" width="100%">
        <Box borderStyle="round" borderColor="gray" padding={0} marginX={1}>
          <Box>
            <Text color={disabled ? 'gray' : 'green'}>{' → '}</Text>
            <Text color={disabled ? 'gray' : 'white'}>
              {localValue.length > 0 ? (
                <>
                  {localValue.slice(0, cursorPosition)}
                  <Text backgroundColor="gray">
                    {localValue.slice(cursorPosition, cursorPosition + 1) || ' '}
                  </Text>
                  {localValue.slice(cursorPosition + 1) || ''}
                </>
              ) : (
                <>
                  <Text backgroundColor="gray"> </Text>
                  <Text dimColor>{placeholder}</Text>
                </>
              )}
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }
);

export default InputField;
