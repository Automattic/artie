/**
 * Main exports for the server module
 */

// Types
export type { AgentServerConfig, SSEConnection } from './types.js';
export type { StreamManager } from './services/stream-manager.js';
export type { ConversationService } from './services/conversation.js';
export type { AgentServer } from './agent-server.js';
export type { ExpressServer } from './adapters/express-adapter.js';

// API Types
export type {
  QueryResponse,
  QueryHandler,
  ToolResultResponse,
  ToolResultHandler,
  StreamHandler,
  ProvidersResponse,
  ProvidersHandler,
  ContextUpdateRequest,
  ContextUpdateResponse,
  ContextHandler,
} from './api/index.js';

// Functions
export { createAgentServer } from './agent-server.js';
export { createExpressServer } from './adapters/express-adapter.js';
export { createStreamManager } from './services/stream-manager.js';
export { createConversationService } from './services/conversation.js';
export { loadConfig, validateConfig } from './config.js';

// API Handlers
export {
  createQueryHandler,
  toolResultHandler,
  createToolResultHandler,
  streamHandler,
  createStreamHandler,
  providersHandler,
  createProvidersHandler,
  contextHandler,
  createContextHandler,
} from './api/index.js';
