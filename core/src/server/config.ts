import { AgentServerConfig } from './types.js';

/**
 * Loads server configuration from environment variables and provided defaults
 */
export const loadConfig = (overrides?: Partial<AgentServerConfig>): AgentServerConfig => {
  // Default configuration values
  const defaults: AgentServerConfig = {
    port: 3000,
    host: 'localhost',
    corsOrigin: '*',
    providers: {
      claude: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
      },
    },
  };

  // Override defaults with environment variables
  const config: AgentServerConfig = {
    ...defaults,
    port: parseInt(process.env.PORT || String(defaults.port), 10),
    host: process.env.HOST || defaults.host,
    corsOrigin: process.env.CORS_ORIGIN || defaults.corsOrigin,
    providers: {
      claude: {
        apiKey: process.env.ANTHROPIC_API_KEY || defaults.providers?.claude?.apiKey || '',
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || defaults.providers?.openai?.apiKey || '',
      },
    },
  };

  // Override with any provided configuration
  if (overrides) {
    return {
      ...config,
      ...overrides,
      providers: {
        ...config.providers,
        ...overrides.providers,
        claude: {
          ...config.providers?.claude,
          ...overrides.providers?.claude,
        },
        openai: {
          ...config.providers?.openai,
          ...overrides.providers?.openai,
        },
      },
    };
  }

  return config;
};

/**
 * Validates the server configuration
 * @returns {string|null} Error message if invalid, null if valid
 */
export const validateConfig = (config: AgentServerConfig): string | null => {
  if (!config) {
    return 'Configuration is required';
  }

  if (config.port && (isNaN(config.port) || config.port < 0 || config.port > 65535)) {
    return 'Port must be a valid number between 0 and 65535';
  }

  // Add more validation rules as needed

  return null;
};
