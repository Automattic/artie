import { useAppContext } from '../context/AppContext.js';
import { useState, useEffect } from 'react';

/**
 * Token and context usage information
 */
export interface TokenUsage {
  usedTokens: number;
  maxTokens: number;
  percentage: number;
  loading: boolean;
}

/**
 * Hook to track token usage and context window percentage
 * @returns Current token usage information including percentage of context window used
 */
export const useTokenUsage = (): TokenUsage => {
  const { state } = useAppContext();
  const { agent, messages } = state;
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    usedTokens: 0,
    maxTokens: 0,
    percentage: 0,
    loading: true,
  });

  useEffect(() => {
    if (!agent) {
      return;
    }

    let isMounted = true;

    // Convert chat messages to provider format
    const providerMessages = messages
      .filter((msg) => {
        // Include text messages and filter out system messages
        if (msg.type === 'text' && msg.role !== 'system') {
          return true;
        }

        // Include tool responses
        if (msg.type === 'tool_response') {
          return true;
        }

        return false;
      })
      .map((msg) => {
        if (msg.type === 'text') {
          return {
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content || '',
          };
        } else if (msg.type === 'tool_response') {
          // Format tool responses similar to how they're presented to the model
          const content = msg.error
            ? `[TOOL ERROR] Tool "${msg.tool}" execution failed: ${msg.error}`
            : `[TOOL RESULT] ${msg.tool || 'unknown'}: ${
                typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)
              }`;

          return {
            role: 'user', // Tool responses are presented as user messages
            content,
          };
        }

        // Should never reach here due to filter, but TypeScript needs this
        return {
          role: 'user',
          content: '',
        };
      });

    const updateUsage = async (): Promise<void> => {
      try {
        const usage = await agent.getContextUsage(providerMessages);

        if (isMounted) {
          setTokenUsage({
            usedTokens: usage.usedTokens,
            maxTokens: usage.maxTokens,
            percentage: usage.percentage,
            loading: false,
          });
        }
      } catch (error) {
        console.error('Failed to get context usage:', error);

        if (isMounted) {
          // If we can get the max context length even if counting fails
          const maxTokens = agent.provider ? agent.provider.getMaxContextLength() : 0;

          setTokenUsage((prev) => ({
            ...prev,
            maxTokens,
            loading: false,
          }));
        }
      }
    };

    void updateUsage();

    return (): void => {
      isMounted = false;
    };
  }, [agent, messages]);

  return tokenUsage;
};
