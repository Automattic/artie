# Artie Server Module

The server module provides a hybrid REST+SSE backend for Artie Core, enabling real-time streaming of agent interactions and tool execution. It's designed to be lightweight, efficient, and framework-agnostic.

## Features

- Real-time message streaming via Server-Sent Events (SSE)
- Stateless REST endpoints for queries and tool results
- Support for streaming partial message updates
- Tool execution delegation between server and client
- Conversation state management
- Clean separation between agent logic and transport layer

## Architecture

The server module is built as a thin communication layer over Artie Core's existing agent functionality:

```
src/server/
├── agent-server.ts     # Main server implementation
├── standalone.ts       # Standalone server entry point
├── constants.ts        # Configuration constants
├── types.ts           # Type definitions
├── index.ts           # Public exports
├── config.ts          # Configuration handling
├── api/               # API endpoint handlers
├── adapters/          # Framework adapters (Express, etc.)
└── services/          # Core services
    ├── stream-manager.ts   # SSE connection management
    └── conversation.ts     # Conversation tracking
```

## Message Streaming

The server uses SSE to stream agent messages and updates in real-time. Different event types are used to handle various aspects of the agent interaction:

### Event Types

1. `message` - New messages from any participant:

```typescript
{
  id: string;
  role: "assistant" | "user" | "tool";
  type: "text" | "tool_request" | "tool_response";
  content?: string;
  createdAt: string;
}
```

2. `update_message` - Streaming updates to existing messages:

```typescript
{
  id: string;
  updates: {
    content: string;
  }
}
```

3. `tool_request` - Tool execution requests:

```typescript
{
  tool: string;
  parameters: Record<string, unknown>;
  requestId: string;
}
```

### Message Flow

1. Client sends query via REST
2. Server creates SSE connection
3. Agent processes query and streams responses
4. Tool requests are delegated as needed
5. Client returns tool results via REST
6. Process continues until completion

## Usage

### Basic Setup

```typescript
import { createAgentServer } from '@Artie/core/server';

const server = createAgentServer({
  port: 3000,
  host: 'localhost',
});

// Connect to SSE stream
const events = new EventSource('/api/stream?conversationId=123');

events.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  // Handle new message
});

events.addEventListener('update_message', (event) => {
  const update = JSON.parse(event.data);
  // Update existing message
});

events.addEventListener('tool_request', (event) => {
  const request = JSON.parse(event.data);
  // Execute tool and send result
});
```

### REST Endpoints

1. Start Query

```typescript
POST /api/query
{
  query: string;
  context?: Record<string, unknown>;
  conversationId?: string;
}
```

2. Return Tool Result

```typescript
POST /api/tool-result
{
  conversationId: string;
  requestId: string;
  result?: unknown;
  error?: string;
}
```

### Express Integration

```typescript
import express from 'express';
import { createExpressAdapter } from '@Artie/core/server/adapters';

const app = express();
const adapter = createExpressAdapter({
  port: 3000,
  host: 'localhost',
});

app.use('/api', adapter.getRoutes());
app.listen(3000);
```

## Configuration

The server can be configured via environment variables or a config object:

```typescript
interface ServerConfig {
  port?: number;
  host?: string;
  corsOrigin?: string | string[];
  providers?: {
    claude?: {
      apiKey?: string;
    };
    openai?: {
      apiKey?: string;
    };
  };
}
```

Environment variables:

```bash
SERVER_PORT=3000
SERVER_HOST=localhost
CORS_ORIGIN=*
ANTHROPIC_API_KEY=sk-...
OPENAI_API_KEY=sk-...
```

## Error Handling

The server implements robust error handling:

1. Connection errors trigger automatic reconnection
2. Tool execution errors are propagated to the agent
3. API errors return appropriate status codes
4. Streaming errors trigger error events
5. Timeouts are handled gracefully

## Development

```bash
# Install dependencies
pnpm install

# Build server
pnpm build

# Run tests
pnpm test

# Start development server
pnpm dev
```

## Best Practices

1. Always handle SSE reconnection in clients
2. Process tool results asynchronously
3. Implement proper error handling
4. Clean up SSE connections when done
5. Validate all tool parameters
6. Handle partial message updates smoothly

## Security Considerations

1. Implement proper authentication
2. Validate all inputs
3. Use CORS appropriately
4. Rate limit requests
5. Handle timeouts
6. Sanitize tool parameters
