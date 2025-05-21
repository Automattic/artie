/**
 * @fileoverview Provides functionality to convert technical tool calls into human-readable descriptions
 * using the configured provider's fast model. This module helps bridge the gap between technical tool execution
 * and user-friendly status messages.
 */

import { runTask } from './runTask.js';

/**
 * Converts a technical tool call into a human-readable description using the configured fast model.
 * @param {string} toolName - The name of the tool being called
 * @param {Record<string, unknown>} params - The parameters being passed to the tool
 * @returns {Promise<string>} A human-readable description of what the tool call does
 * @remarks
 * This function:
 * 1. Uses the configured fast model to generate natural language descriptions
 * 2. Provides clear, jargon-free explanations of tool actions
 * 3. Handles API errors gracefully with a fallback format
 * 4. Keeps descriptions concise and focused on the action
 *
 * Example outputs:
 * - "Fetching weather data for Vancouver BC from weather.gc.ca"
 * - "Searching for JavaScript files in the src directory"
 * - "Creating a new user account for john.doe@example.com"
 */
export const getHumanReadableToolCall = async (
  toolName: string,
  params: Record<string, unknown>
): Promise<string> => {
  try {
    const prompt = `
You are tasked with transforming a technical tool call into a simple, human-readable sentence.
The tool call is: ${toolName}
The parameters are: ${JSON.stringify(params, null, 2)}

Respond with a single, concise sentence that describes what action is being performed.
For example, if the tool is "fetch" with URL parameter "https://weather.gc.ca/city/vancouver/pages/bc-74_metric_e.html",
you would respond with: "Fetching weather data for Vancouver BC from weather.gc.ca"

Keep your response short, clear, and focused only on what the tool is doing. Don't use technical jargon.
Do not include phrases like "The tool is..." or "This tool call...".
`;

    const readableMessage = await runTask(prompt, {
      maxTokens: 100,
      temperature: 0.3,
    });

    return readableMessage || `Using ${toolName}`;
  } catch (error) {
    // Log the error and fallback to a simple format if LLM call fails
    console.error(
      'Failed to generate human readable tool call:',
      error instanceof Error ? error.message : String(error)
    );
    return `Using ${toolName} ${Object.keys(params).length > 0 ? 'with parameters' : ''}`;
  }
};
