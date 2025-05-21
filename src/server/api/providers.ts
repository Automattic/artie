import { ProviderInfo } from '../types.js';

/**
 * Type definition for providers response
 */
export type ProvidersResponse = {
  providers: ProviderInfo[];
};

/**
 * Type definition for providers handler
 */
export type ProvidersHandler = {
  getProviders: () => ProvidersResponse;
};

/**
 * Creates a providers handler for listing available AI providers
 */
export const createProvidersHandler = (): ProvidersHandler => {
  /**
   * Gets the list of available AI providers
   */
  const getProviders = (): ProvidersResponse => {
    return {
      providers: [
        {
          name: 'claude',
          models: [
            'claude-sonnet-3-7-latest',
            'claude-sonnet-3-5-latest',
            'claude-haiku-3-5-latest',
          ],
        },
        {
          name: 'openai',
          models: ['gpt-4o', 'gpt-4o-mini', 'o1-mini'],
        },
      ],
    };
  };

  return {
    getProviders,
  };
};

/**
 * Default providers handler instance
 */
export const providersHandler = createProvidersHandler();
