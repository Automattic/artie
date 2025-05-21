/**
 * @fileoverview Provides a unified interface for executing AI tasks across different providers.
 * This module abstracts away the complexity of provider-specific implementations and model selection,
 * offering a simple, consistent way to run AI tasks using environment-based configuration.
 *
 * @module tasks/runTask
 */

import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment vars from monorepo root
const envPath = path.resolve(__dirname, '../../../../.env');
dotenv.config({ path: envPath });

/**
 * Configuration options for running an AI task
 * @typedef {Object} TaskConfig
 * @property {number} [maxTokens] - Maximum number of tokens to generate
 * @property {number} [temperature] - Sampling temperature between 0 and 1
 */
type TaskConfig = {
  maxTokens?: number;
  temperature?: number;
};

/**
 * Creates a task client based on the configured provider
 * @returns {Anthropic | OpenAI} A configured client for either Anthropic or OpenAI
 */
const createTaskClient = (): Anthropic | OpenAI => {
  const provider = process.env.PROVIDER || 'anthropic';

  switch (provider) {
    case 'openai':
      return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    case 'anthropic':
      return new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    default:
      throw new Error(`Unsupported provider type: ${provider}`);
  }
};

/**
 * Gets the appropriate model for tasks based on provider and environment settings
 * @returns {string} The model identifier to use
 *
 * @example
 * ```typescript
 * const model = getTaskModel(); // Returns appropriate model ID
 * ```
 */
const getTaskModel = (): string => {
  const provider = process.env.PROVIDER || 'anthropic';

  if (provider === 'openai') {
    return process.env.OPENAI_FAST_MODEL || 'gpt-4o-mini';
  }

  return process.env.ANTHROPIC_FAST_MODEL || 'claude-3-5-haiku-latest';
};

/**
 * Executes a task using the configured provider and model
 * @param {string} prompt - The prompt to send to the model
 * @param {TaskConfig} [config] - Optional configuration for the task
 * @returns {Promise<string>} The model's response text
 *
 * @remarks
 * This function:
 * 1. Automatically selects and configures the appropriate AI provider
 * 2. Uses environment variables for provider selection and configuration
 * 3. Handles provider-specific API differences transparently
 * 4. Provides consistent error handling across providers
 * 5. Uses efficient models suitable for quick tasks
 * 6. Supports configurable temperature and token limits
 *
 * Environment Variables:
 * - PROVIDER: 'anthropic' or 'openai' (defaults to 'anthropic')
 * - ANTHROPIC_API_KEY: API key for Anthropic
 * - OPENAI_API_KEY: API key for OpenAI
 * - ANTHROPIC_FAST_MODEL: Custom model for Anthropic
 * - OPENAI_FAST_MODEL: Custom model for OpenAI
 *
 * @example
 * ```typescript
 * // Basic usage
 * const response = await runTask('What is 2+2?');
 *
 * // With configuration
 * const response = await runTask('Generate a story', {
 *   maxTokens: 500,
 *   temperature: 0.7
 * });
 * ```
 *
 * @throws {Error} If the API request fails or returns an invalid response
 */
export const runTask = async (prompt: string, config: TaskConfig = {}): Promise<string> => {
  const client = createTaskClient();
  const model = getTaskModel();
  const provider = process.env.PROVIDER || 'anthropic';

  try {
    if (provider === 'openai') {
      const openaiClient = client as OpenAI;
      const response = await openaiClient.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: config.temperature ?? 0.3,
        max_tokens: config.maxTokens ?? 2000,
      });

      return response.choices[0]?.message?.content || '';
    } else {
      const anthropicClient = client as Anthropic;
      const response = await anthropicClient.messages.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: config.temperature ?? 0.3,
        max_tokens: config.maxTokens ?? 2000,
      });

      return response.content[0]?.type === 'text' ? response.content[0].text : '';
    }
  } catch (error) {
    console.error(
      'Failed to complete task:',
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
};
