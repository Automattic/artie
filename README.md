# Artie

Artie is an AI agent framework with MCP (Model Context Protocol) integration, providing tools for building AI agents with various LLM providers. The project is structured as a monorepo containing core functionality and a CLI interface.

## Project Structure

```
artie
├── packages
│   ├── cli          # Command-line interface for artie
│   └── core         # Core functionality and agent implementation
├── mcp-servers.json # Model Context Protocol server configuration
└── package.json     # Root package configuration
```

## Features

- Integration with multiple LLM providers (Anthropic Claude, OpenAI)
- Model Context Protocol (MCP) support for enhanced contextual understanding
- Agent framework with customizable tools
- Command-line interface for interactive use
- Express server for API integrations

## Getting Started

### Prerequisites

- Node.js (v18+)
- pnpm package manager

### Installation

1. Clone the repository

   ```
   git clone https://github.com/Automattic/artie.git
   cd artie
   ```

2. Install dependencies

   ```
   pnpm install
   ```

3. Create a `.env` file with your API keys (see `.env.example` for required variables)

4. Configure MCP servers in `mcp-servers.json` (see `mcp-servers.example.json`)

### Development

Build and watch for changes:

```bash
# Build all packages
pnpm build

# Development mode with watch for core package
pnpm dev:core

# Development mode with watch for CLI
pnpm dev:cli
```

### Running the CLI

```bash
# Start the CLI interface
pnpm start:cli

# Specify MCP servers
pnpm start:cli -- --servers=fetch,code-exec
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm test:core
pnpm test:cli

# Run tests with coverage
pnpm --filter @artie/core test:coverage
```

## Architecture

- **Core Package**: Implements agent functionality, provider interfaces, and MCP integration
- **CLI Package**: React-based terminal UI using Ink for interactive agent usage

## API Reference

The core package exports the following key functions:

- `createAgent` - Create a new AI agent with specified tools and provider
- `createProvider` - Create a language model provider (OpenAI, Claude)
- `createMCPClient` - Create a Model Context Protocol client
- `createClaudeProvider` - Create a provider specifically for Anthropic's Claude models

## License

MIT License

## Contributing

PRs are welcome!
