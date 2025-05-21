import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { FullHeightBox } from '../../ui/FullHeightBox.js';

// Create mock stdout object
const mockStdout = {
  rows: 24,
  on: vi.fn(),
  removeListener: vi.fn(),
};

// Mock the 'ink' module
vi.mock('ink', () => ({
  Box: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useStdout: () => ({
    stdout: mockStdout,
  }),
}));

describe('FullHeightBox', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockStdout.on.mockClear();
    mockStdout.removeListener.mockClear();
  });

  it('should render children', () => {
    const { getByText } = render(
      <FullHeightBox>
        <div>Test content</div>
      </FullHeightBox>
    );

    expect(getByText('Test content')).toBeDefined();
  });

  it('should subscribe to resize events on mount', () => {
    render(
      <FullHeightBox>
        <div>Test content</div>
      </FullHeightBox>
    );

    // Check that the resize listener was added
    expect(mockStdout.on).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('should clean up resize listeners on unmount', () => {
    const { unmount } = render(
      <FullHeightBox>
        <div>Test content</div>
      </FullHeightBox>
    );

    // Unmount the component
    unmount();

    // Check that the resize listener was removed
    expect(mockStdout.removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
