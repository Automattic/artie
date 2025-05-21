import path from 'path';
import fs from 'fs/promises';
import { createFileLogger, type Logger } from '../utils/logger/index.js';
import { defaultSystemPrompt } from './prompt/default-system-prompt.js';

const logger: Logger = createFileLogger();

/**
 * Finds the workspace root by looking for the first package.json that isn't the CLI package
 * Traverses up the directory tree until it finds a suitable package.json
 */
const findWorkspaceRoot = async (startDir: string): Promise<string> => {
  let currentDir = startDir;

  while (currentDir !== path.parse(currentDir).root) {
    try {
      const packageJsonPath = path.join(currentDir, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const pkg = JSON.parse(content);

      // If we find a package.json that isn't the CLI package, this is our root
      if (!pkg.name?.includes('cli')) {
        return currentDir;
      }
    } catch {
      // Ignore errors and continue searching up
    }

    currentDir = path.dirname(currentDir);
  }

  // If we can't find a non-CLI package.json, fall back to cwd
  logger.warn('Could not find workspace root, falling back to current working directory');
  return process.cwd();
};

/**
 * Attempts to extract a tool call embedded in text using the format:
 * <tool_call tool="TOOL_NAME" parameters='JSON_PARAMETERS' />
 * @param text The text content to search within.
 * @returns An object with { tool, parameters } if found and valid, otherwise null.
 */
export const extractToolCallFromTextResponse = (
  text: string
): { tool: string; parameters: Record<string, unknown> } | null => {
  if (!text) {
    return null;
  }

  // Regex to capture tool name and parameters JSON string
  // Allows single or double quotes around parameters attribute
  const regex = /<tool_call\s+tool="([\w_\-]+)"\s+parameters=(?:"|')({.*?})(?:"|')\s*\/>/is;
  const match = text.match(regex);

  if (match && match[1] && match[2]) {
    const tool = match[1];
    const paramsString = match[2];

    try {
      const parameters = JSON.parse(paramsString);
      logger.info(`Extracted tool call from text: ${tool}`, parameters);
      return { tool, parameters };
    } catch (error) {
      logger.error('Failed to parse parameters JSON from extracted tool_call tag', {
        tool,
        paramsString,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  } else {
    // Log if text contains the tag but regex failed (for debugging regex)
    if (text.includes('<tool_call')) {
      logger.debug('Found <tool_call> tag but regex failed to match expected format.', { text });
    }
  }

  return null;
};

export const getSystemPrompt = async (): Promise<string> => {
  const workspaceRoot = await findWorkspaceRoot(process.cwd());
  const systemPromptPath = path.join(workspaceRoot, 'system-prompt.txt');
  let systemPrompt: string;

  try {
    systemPrompt = await fs.readFile(systemPromptPath, 'utf8');
  } catch {
    // If the custom system prompt doesn't exist, use the default one
    systemPrompt = defaultSystemPrompt;
  }

  // Replace {TODAYS_DATE} with the current date
  return systemPrompt.replace(
    '{TODAYS_DATE}',
    new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  );
};
