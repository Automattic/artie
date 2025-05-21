import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import InputField from '../../ui/InputField.js';

// Mock the 'ink' module since it depends on terminal functionality
vi.mock('ink', () => ({
  Box: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({
    children,
    color,
    backgroundColor,
    dimColor,
  }: {
    children: React.ReactNode;
    color?: string;
    backgroundColor?: string;
    dimColor?: boolean;
  }) => (
    <span
      data-color={color}
      data-bg-color={backgroundColor}
      data-dim={dimColor ? 'true' : undefined}
    >
      {children}
    </span>
  ),
  useInput: (callback: (input: string, key: any) => void) => {
    // Store the callback for test access
    if (typeof window !== 'undefined') {
      (window as any).inputCallback = callback;
    }
  },
}));

describe('InputField', () => {
  // Helper function to simulate key presses
  const simulateKeyPress = (input: string, key: any) => {
    if (typeof window !== 'undefined' && (window as any).inputCallback) {
      act(() => {
        (window as any).inputCallback(input, key);
      });
    }
  };

  it('should render with placeholder text when value is empty', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    const { container } = render(
      <InputField value="" onChange={onChange} onSubmit={onSubmit} placeholder="Test placeholder" />
    );

    // Check if placeholder is visible
    expect(container.innerHTML).toContain('Test placeholder');
  });

  it('should render with provided value', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    const { container } = render(
      <InputField value="Test value" onChange={onChange} onSubmit={onSubmit} />
    );

    // Check if value is visible
    expect(container.innerHTML).toContain('Test value');
  });

  it('should call onChange when typing characters', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(<InputField value="" onChange={onChange} onSubmit={onSubmit} />);

    // Simulate typing 'a'
    simulateKeyPress('a', {});

    // Check if onChange was called with the updated value
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('should call onSubmit when pressing Enter key', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(<InputField value="Test input" onChange={onChange} onSubmit={onSubmit} />);

    // Simulate pressing Enter
    simulateKeyPress('', { return: true });

    // Check if onSubmit was called with the current value
    expect(onSubmit).toHaveBeenCalledWith('Test input');
  });

  it('should not call onSubmit when pressing Enter with empty trimmed input', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(<InputField value="   " onChange={onChange} onSubmit={onSubmit} />);

    // Simulate pressing Enter
    simulateKeyPress('', { return: true });

    // Check that onSubmit was not called
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('should handle backspace key', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(<InputField value="Test" onChange={onChange} onSubmit={onSubmit} />);

    // Simulate pressing backspace
    simulateKeyPress('', { backspace: true });

    // Check if onChange was called with the updated value (last character removed)
    expect(onChange).toHaveBeenCalledWith('Tes');
  });

  it('should call history navigation callbacks', () => {
    const onHistoryUp = vi.fn();
    const onHistoryDown = vi.fn();
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <InputField
        value=""
        onChange={onChange}
        onSubmit={onSubmit}
        onHistoryUp={onHistoryUp}
        onHistoryDown={onHistoryDown}
      />
    );

    // Simulate pressing up arrow
    simulateKeyPress('', { upArrow: true });
    expect(onHistoryUp).toHaveBeenCalled();

    // Simulate pressing down arrow
    simulateKeyPress('', { downArrow: true });
    expect(onHistoryDown).toHaveBeenCalled();
  });

  it('should not process input when disabled', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(<InputField value="Test" onChange={onChange} onSubmit={onSubmit} disabled={true} />);

    // Try typing a character
    simulateKeyPress('a', {});

    // Check that onChange was not called
    expect(onChange).not.toHaveBeenCalled();

    // Try to submit
    simulateKeyPress('', { return: true });

    // Check that onSubmit was not called
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
