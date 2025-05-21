/**
 * @fileoverview Utility functions for language model providers.
 * Handles common operations like tool call extraction, parameter parsing, and text processing
 * that can be shared across different provider implementations.
 *
 * @module provider/utils
 */

import { ToolDefinition } from './types.js';
import { createFileLogger, type Logger } from '../utils/logger/index.js';

const logger: Logger = createFileLogger();

/**
 * Percentage of context window to allow for tool responses.
 * Limits tool responses to avoid consuming too much context.
 */
export const TOOL_RESPONSE_CONTEXT_PERCENTAGE = 0.4; // Use up to 40% of context for tool responses

/**
 * Checks if text contains a final answer tag.
 *
 * @param {string} text - Text to check for final answer tag
 * @returns {boolean} True if the text contains a final answer tag
 */
export const containsFinalAnswerTag = (text: string): boolean => {
  return /<final_answer>/i.test(text);
};

/**
 * Attempts to extract a tool call from text content.
 * This is a fallback for cases where a model signals tool use in text
 * but doesn't emit formal tool_use events.
 *
 * @param {string} text - Text content to analyze
 * @param {ToolDefinition[]} [tools] - Available tools to match against
 * @returns {Object|null} Extracted tool call or null if none found
 */
export const extractToolCallFromText = (
  text: string,
  tools?: ToolDefinition[]
): { name: string; parameters: Record<string, unknown> } | null => {
  if (!tools || tools.length === 0) return null;

  // Track all tool names and detect which one might be mentioned in text
  const toolNames = tools.map((t) => t.name);

  // Check for <tool_call> tags as specified in the system prompt
  const toolCallTagPattern = /<tool_call>([\s\S]*?)<\/tool_call>/i;
  const toolCallMatch = text.match(toolCallTagPattern);

  if (toolCallMatch && toolCallMatch[1]) {
    const toolCallContent = toolCallMatch[1].trim();

    // Extract tool name and parameters - looking for pattern like: toolname(params)
    // or toolname__function(params)
    const toolCallPattern = /([a-zA-Z0-9_]+)(?:__([a-zA-Z0-9_]+))?\s*\(\s*([\s\S]*?)\s*\)/;
    const callMatch = toolCallContent.match(toolCallPattern);

    if (callMatch) {
      // Extract the tool name (could be either standalone or part of namespace)
      let toolName = callMatch[1];
      if (callMatch[2]) {
        // If it's in the format namespace__function, use the full name or function name
        // depending on what's in the tools list
        const fullName = `${callMatch[1]}__${callMatch[2]}`;
        toolName = toolNames.includes(fullName) ? fullName : callMatch[2];
      }

      // Make sure this is a valid tool
      if (toolNames.includes(toolName)) {
        // Extract and parse parameters
        const paramText = callMatch[3];

        // Handle key-value pairs format (param: value)
        const params: Record<string, unknown> = {};
        const paramPattern = /\s*([a-zA-Z0-9_]+)\s*:\s*(?:'([^']*)'|"([^"]*)"|([^,\s]*))/g;
        let paramMatch;

        while ((paramMatch = paramPattern.exec(paramText)) !== null) {
          const key = paramMatch[1];
          // Use the first non-undefined value from the capturing groups
          const value = paramMatch[2] ?? paramMatch[3] ?? paramMatch[4];
          params[key] = value;
        }

        // If we found at least one parameter
        if (Object.keys(params).length > 0) {
          return {
            name: toolName,
            parameters: params,
          };
        }

        // Return just the tool name with empty parameters if we couldn't parse params
        return {
          name: toolName,
          parameters: {},
        };
      }
    }
  }

  // No valid tool call found
  return null;
};

/**
 * Parses JSON safely with recovery mechanisms for partial or malformed JSON.
 *
 * @param {string} jsonString - JSON string to parse
 * @param {string} toolName - Name of the tool (for context in logs)
 * @returns {Record<string, unknown>} Parsed parameters object
 */
export const safeParseToolParameters = (
  jsonString: string,
  toolName: string
): Record<string, unknown> => {
  let jsonToParse = jsonString.trim();

  try {
    // Handle common JSON issues

    // 1. Missing opening brace
    if (!jsonToParse.startsWith('{')) {
      jsonToParse = `{${jsonToParse}`;
    }

    // 2. Missing closing brace
    if (!jsonToParse.endsWith('}')) {
      jsonToParse = `${jsonToParse}}`;
    }

    // 3. Replace single quotes with double quotes
    jsonToParse = jsonToParse.replace(/'/g, '"');

    // 4. Fix common parameter patterns if parsing fails
    try {
      return JSON.parse(jsonToParse);
    } catch {
      // Special handling for 'fetch' tool with URL parameter
      if (toolName === 'fetch') {
        const urlMatch = jsonToParse.match(/(?:"url"|url)["\s]*[:=]["\s]*([^"',}\s]+)/);
        if (urlMatch && urlMatch[1]) {
          return { url: urlMatch[1] };
        }
      }

      // Try to extract parameters as key-value pairs
      const paramPattern = /(?:"([^"]+)"|(\w+))["\s]*[:=]["\s]*(?:"([^"]+)"|([^,}\s]+))/g;
      const params: Record<string, unknown> = {};
      let match;

      while ((match = paramPattern.exec(jsonToParse)) !== null) {
        const key = match[1] || match[2];
        const value = match[3] || match[4];
        params[key] = value;
      }

      if (Object.keys(params).length > 0) {
        return params;
      }

      // Last resort: Empty parameters
      return {};
    }
  } catch (error) {
    logger.error('Failed to parse tool parameters', {
      json: jsonString,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
};

/**
 * Truncates tool results to fit within context window limits.
 *
 * @param {string} result - The tool result string to potentially truncate
 * @param {number} maxContextLength - Maximum context length in tokens
 * @returns {string} Truncated tool result with warning if needed
 *
 * @remarks
 * This function ensures tool responses don't consume too much of the context window
 * by limiting them to a percentage of the total context length. If truncation
 * is needed, a warning is added to the response.
 */
export const truncateToolResult = (result: string, maxContextLength: number): string => {
  const maxToolResponseLength = Math.floor(maxContextLength * TOOL_RESPONSE_CONTEXT_PERCENTAGE);
  const estimatedTokens = Math.ceil(result.length / 4); // Rough estimate of tokens
  if (estimatedTokens <= maxToolResponseLength) {
    return result;
  }

  // If too long, truncate and add warning
  const truncateWarning = '\n[WARNING: Tool response was truncated to fit within context limits]';
  const targetLength = maxToolResponseLength * 4 - truncateWarning.length;
  return result.slice(0, targetLength) + truncateWarning;
};
