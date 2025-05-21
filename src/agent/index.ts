// Export main types and interfaces
export type {
  Message,
  QueuedToolRequest,
  AgentConfig,
  Agent,
  AgentProviderResponse,
  ToolExecutionResult,
} from './types.js';

// Export core agent functionality
export { createAgent } from './createAgent.js';

// Export utility functions for testing/advanced usage
export {
  createMessageFromResponse,
  createUserMessage,
  createSystemMessage,
  createErrorMessage,
  createFormattedResponse,
} from './provider/messages.js';

export { convertToProviderMessages } from './provider/messages.js';
export { executeToolRequest } from './tools/toolExecution.js';
export { processInitialQuery, getContinuationResponse } from './provider/providerInteraction.js';
export { processToolQueue } from './tools/toolQueue.js';
