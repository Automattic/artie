/**
 * @fileoverview Factory function to create language model provider instances based on environment configuration.
 * Provides a unified entry point for creating provider instances regardless of the underlying implementation.
 *
 * @module provider/createProvider
 */

import { Provider } from './types.js';
import { createClaudeProvider } from './providers/claude.js';
import { createOpenAIProvider } from './providers/openai.js';

/**
 * Creates a provider instance based on provider type specified in environment variables.
 *
 * @returns {Provider} A configured provider instance (OpenAI or Claude)
 *
 * @remarks
 * This factory function uses the PROVIDER environment variable to determine which
 * provider implementation to instantiate. If no environment variable is set,
 * it defaults to the Anthropic Claude provider.
 *
 * The provider instances abstract away the differences between different LLM APIs,
 * providing a consistent interface for the rest of the application.
 *
 * @example
 * ```typescript
 * const provider = createProvider();
 * const response = await provider.complete(messages);
 * ```
 */
export const createProvider = (): Provider => {
  const providerType = process.env.PROVIDER || 'anthropic';

  switch (providerType) {
    case 'openai':
      return createOpenAIProvider();
    case 'anthropic':
      return createClaudeProvider();
    default:
      throw new Error(`Unsupported provider type: ${providerType}`);
  }
};
