# Agent Package Architecture

## Overview

The agent package provides a flexible, tool-enabled AI agent architecture that orchestrates interactions between language model providers and external tools. It serves as the coordination layer that facilitates autonomous tool-using AI capabilities through a well-defined workflow.

The agent is designed to:

1. Process user queries through language model providers
2. Identify and execute appropriate tools based on provider responses
3. Maintain conversation state and context
4. Handle tool chaining for complex multi-step tasks
5. Manage errors and edge cases throughout the interaction flow
6. Store and retrieve conversation history with semantic search capabilities

## Core Components

The package is organized around key functional areas:

#### Provider Integration (`/provider`)

- **messages.ts**: Utilities for message creation, conversion, and formatting.
- **providerInteraction.ts**: Handles communication flow with language model providers.

#### Tool Management (`/tools`)

- **toolExecution.ts**: Executes individual tool requests with validation and error handling.
- **toolQueue.ts**: Manages sequential processing of queued tool requests.

#### Memory Management (`/store`)

- **memoryStore.ts**: Vector-based storage for conversation history with semantic search.
- **contextSelector.ts**: Selects relevant messages for the context window within token limits.
- **embeddings.ts**: Generates vector embeddings for semantic search capabilities.
- **adapters/**: Pluggable vector database backends (ChromaDB, WordPress, etc.).

#### Prompts (`/prompts`)

- **systemPrompt.ts**: Defines the default system prompt that shapes agent behavior.

## Agent Interaction Lifecycle

1. The user's query is received and stored
2. Relevant conversation context is selected
3. The provider processes the query and generates either:
   - A direct text response, or
   - A tool request that requires execution
4. Tool requests are executed and their results are fed back to the provider
5. The provider can request multiple tools in sequence
6. All user, assistant and tool requests are stored in the vector db for future retreival.
7. The final response is returned to the user

This lifecycle may involve multiple iterations of tool execution before reaching a final response, with the context being updated after each step.

## Agent Workflow

The agent's workflow consists of these primary processes:

1. **Query Processing**:

   - Initializes conversation with system prompt if needed
   - Adds user message to history
   - Processes query through language model provider
   - Identifies and queues tool requests

2. **Tool Execution**:

   - Processes queued tool requests sequentially
   - Validates tool parameters and prevents repeated failures
   - Executes tools through MCP client
   - Formats responses for provider consumption

3. **Response Generation**:

   - Gets continuation responses after tool execution
   - Manages message flow between provider and tools
   - Prevents infinite loops with chain length limits
   - Handles errors gracefully throughout the process

4. **Memory Management**:
   - Stores conversation history with vector embeddings
   - Selects relevant context messages within token limits
   - Performs semantic search for related information
   - Manages memory constraints with configurable policies

## Design Principles

The agent package follows these key design principles:

1. **Functional Programming**: Uses immutable data structures and pure functions where possible.
2. **Async Generators**: Leverages async generators for real-time message streaming.
3. **Error Isolation**: Contains errors at appropriate boundaries to prevent cascading failures.
4. **Clear Separation of Concerns**: Each module has well-defined responsibilities.
5. **Extensive Logging**: Comprehensive logging for debugging and analysis.
6. **Type Safety**: Strong TypeScript typing throughout the codebase.

## Error Handling

Error handling is implemented throughout the system:

- **Tool Execution Errors**: Captured and formatted as error messages
- **Provider Errors**: Caught and reported to preserve conversation flow
- **Infinite Loop Prevention**: Maximum chain length enforcement
- **Failed Attempt Tracking**: Prevention of repeated failing tool calls
- **Storage Fallbacks**: Graceful degradation when primary storage methods fail

## Configuration

The agent can be configured through:

- **System Prompt**: Defines the agent's personality and capabilities
- **Provider Selection**: Different language model providers can be used
- **Tool Availability**: Dynamic tool discovery through MCP client
- **Memory Settings**: Configure message retention and context selection policies
- **Vector Store**: Select and configure the vector database backend
- **Environment Variables**: Toggle features like message persistence (see below)

### Environment Variables

The agent's behavior can be modified with the following environment variables:

- **ENABLE_MESSAGE_PERSISTENCE**: Controls whether messages are persisted to the vector store
  - Set to `true`, `yes`, `1`, or `on` (default) to enable message persistence
  - Set to `false`, `no`, `0`, or `off` to disable persistence, which prevents messages from being stored in the vector database
  - Case insensitive - `TRUE`, `True`, and `true` are all valid
  - This is useful for testing or privacy-sensitive scenarios where you don't want to store conversation history

## Memory Management

The agent's memory is managed through the Store library, which provides:

- **Vector-Based Storage**: Enables semantic search of conversation history
- **Context Selection**: Intelligently selects messages for the context window
- **Multi-User Support**: Namespaces collections for multi-user environments
- **Configurable Retention**: Message limits and protected message categories
- **Fallback Mechanisms**: Local embedding generation when API services unavailable

For more details, see the [Store Library README](./store/README.md).
