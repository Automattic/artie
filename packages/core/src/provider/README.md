# Provider Package Architecture

## Overview

The provider package offers a standardized interface for interacting with different language model providers such as OpenAI and Anthropic. It abstracts away the specific implementation details of each provider, allowing the rest of the application to interact with language models through a unified API.

The provider package is designed to:

1. Provide a consistent interface regardless of the underlying model provider
2. Stream responses from language model providers
3. Support tool calling capabilities across different providers
4. Handle token counting and context management
5. Normalize message formats between various providers
6. Support rich content including text and tool results

## Core Components

The provider package consists of the following core components:

### Main Interfaces

- **Provider**: The primary interface that defines methods for interacting with language models.
- **ProviderMessage**: Standardized message format for communication with providers.
- **ProviderConfig**: Configuration options for initializing providers.

### Key Modules

- **createProvider.ts**: Factory function that creates the appropriate provider based on environment settings.
- **index.ts**: Public API exports for the provider package.

### Functional Areas

The package is organized around key functional areas:

#### Type Definitions (`/types.ts`)

- **Provider and BaseProvider**: Interfaces that define the core provider capabilities.
- **ProviderMessage**: Common message format for all providers.
- **ProviderResponse**: Standardized response format with usage information.
- **ToolDefinition**: Interface for tool definitions that can be passed to providers.

#### Provider Implementations (`/providers`)

- **claude.ts**: Anthropic Claude provider implementation.
- **openai.ts**: OpenAI provider implementation.

## Workflow

The provider's workflow consists of these primary processes:

1. **Provider Initialization**:

   - Selects appropriate provider based on configuration/environment
   - Sets up API connections with authentication
   - Initializes with configured model and parameters

2. **Message Processing**:

   - Normalizes incoming messages to provider-specific formats
   - Manages conversation history formatting
   - Translates between the common interface and provider-specific APIs

3. **Response Streaming**:

   - Streams responses from providers in real-time
   - Normalizes streaming formats to a consistent interface
   - Parses tool call requests from responses

4. **Tool Integration**:
   - Handles tool definition conversion between providers
   - Supports tool calling in capable providers
   - Produces standardized tool request/response formats

## Provider Capabilities

The provider interface supports these key capabilities:

1. **Completion Generation**:

   - Streaming text completions from models
   - Support for system prompts
   - Conversation history management

2. **Tool Calling**:

   - Tool definition registration
   - Tool request parsing
   - Tool response handling

3. **Context Management**:
   - Token counting for messages
   - Maximum context length awareness
   - Context window optimization

## Provider Types

The package currently supports two provider types:

1. **OpenAI Provider**:

   - Supports models like gpt-4o, gpt-4o-mini, o1-mini
   - Implements OpenAI's tool calling format
   - Handles organization-level API access

2. **Anthropic Provider**:

   - Supports models like claude-sonnet-3-7-latest, claude-sonnet-3-5-latest, claude-haiku-3-5-latest
   - Implements Anthropic's tool use format
   - Handles Anthropic-specific streaming

## Error Handling

Error handling is implemented throughout the system:

- **API Errors**: Captures and normalizes provider-specific errors
- **Rate Limiting**: Handles rate limit errors with appropriate messaging
- **Token Limits**: Manages token limit errors across providers
- **Connection Issues**: Gracefully handles API connection problems

## Design Principles

The provider package follows these key design principles:

1. **Interface Consistency**: Unified interface regardless of underlying provider
2. **Functional Programming**: Uses immutable data and pure functions where possible
3. **Streaming First**: Designed for streaming responses by default
4. **Provider Agnosticism**: Abstracts provider-specific details
5. **Type Safety**: Strong TypeScript typing throughout

## Future Extensions

The architecture is designed to be extensible in these areas:

1. Additional provider integrations
2. Enhanced multi-modal capabilities
3. Provider-specific optimizations
4. Advanced prompt templating
5. Cost and usage tracking

## Conclusion

The provider package creates a consistent interface for interacting with various language model providers, allowing the application to leverage different models without changing its core logic. By abstracting away provider-specific details, it enables flexible model selection while maintaining a unified API for completion generation, tool calling, and context management.
