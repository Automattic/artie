import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  CallToolResult,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Execute code using child process
const executeCode = async (
  code: string
): Promise<{ output: string; errors: string; result?: any }> => {
  // Create a unique temporary filename
  const tempFileName = join(tmpdir(), `code-exec-${randomBytes(16).toString('hex')}.js`);
  let output = '';
  let errors = '';
  let child: ReturnType<typeof spawn> | null = null;
  const executionTimeout = 5000; // 5 seconds timeout

  try {
    // Write code to temporary file
    await writeFile(tempFileName, code, 'utf8');

    // Spawn the node process
    child = spawn(process.execPath, [tempFileName], {
      stdio: ['pipe', 'pipe', 'pipe'], // Pipe stdin, stdout, stderr
      timeout: executionTimeout,
    });

    // Use a promise to wait for the process to finish or timeout
    await new Promise<void>((resolve, reject) => {
      if (!child || !child.stdout || !child.stderr) {
        return reject(new Error('Failed to spawn child process.'));
      }

      const timer = setTimeout(() => {
        if (child && !child.killed) {
          child.kill('SIGKILL'); // Force kill on timeout
          reject(new Error(`Execution timed out after ${executionTimeout}ms`));
        }
      }, executionTimeout);

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errors += data.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err); // Handle errors like process not found
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (signal === 'SIGKILL') {
          // Already rejected by timeout handler
          return;
        }
        if (code !== 0) {
          // Include stderr in the error message if process exited abnormally
          reject(
            new Error(
              `Process exited with code ${code}${errors ? `\nStderr: ${errors.trim()}` : ''}`
            )
          );
        } else {
          resolve(); // Process finished successfully
        }
      });
    });

    // Note: Capturing a 'result' like vm.run did is harder here.
    // The primary outputs are stdout and stderr.
    // We'll return undefined for result for simplicity.
    return { output: output.trim(), errors: errors.trim(), result: undefined };
  } catch (error: any) {
    // Ensure errors are captured even if process fails to spawn or during setup
    errors = error instanceof Error ? error.message : String(error);
    // Include any stderr collected before the main error occurred
    const finalErrors = errors.trim();
    return { output: output.trim(), errors: finalErrors, result: undefined };
  } finally {
    // Clean up the temporary file
    if (child && !child.killed) {
      // Ensure process is killed if it's still running somehow (e.g., error during promise setup)
      child.kill('SIGKILL');
    }
    try {
      await unlink(tempFileName);
    } catch (cleanupError) {
      // Log cleanup error but don't overwrite original error
      console.error(`Failed to delete temporary file ${tempFileName}:`, cleanupError);
    }
  }
};

// Define the tools once to avoid repetition
const TOOLS: Tool[] = [
  {
    name: 'run_code',
    description: 'Execute JavaScript code in isolation',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
      },
      required: ['code'],
    },
  },
];

async function handleToolCall(name: string, args: any): Promise<CallToolResult> {
  switch (name) {
    case 'run_code':
      try {
        const { output, errors, result } = await executeCode(args.code);
        let responseText = '';

        if (output) {
          responseText += `Output: ${output}\n`;
        }

        if (result !== undefined) {
          try {
            responseText += `Result: ${JSON.stringify(result)}\n`;
          } catch (error) {
            responseText += `Result: [${typeof result}]\n`;
          }
        }

        if (errors) {
          responseText += `Errors: ${errors}\n`;
        }

        return {
          content: [
            {
              type: 'text',
              text: responseText.trim(),
            },
          ],
          isError: !!errors,
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Execution error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }

    default:
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
}

const server = new Server(
  {
    name: 'automattic/code-exec',
    version: '0.1.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// Setup request handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri.toString();

  throw new Error(`Resource not found: ${uri}`);
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  handleToolCall(request.params.name, request.params.arguments ?? {})
);

export async function runServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);

process.stdin.on('close', () => {
  console.error('Puppeteer MCP Server closed');
  server.close();
});
