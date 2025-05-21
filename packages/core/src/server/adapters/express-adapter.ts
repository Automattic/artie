import express, { Router, Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import {
  AgentServerConfig,
  ApiResponse,
  SSEConnection,
  ToolResultRequest,
  QueryRequest,
} from '../types.js';
import { createAgentServer } from '../agent-server.js';
import {
  createQueryHandler,
  toolResultHandler,
  streamHandler,
  providersHandler,
} from '../api/index.js';

/**
 * Type definition for the ExpressServer
 */
export type ExpressServer = {
  start: (port?: number, host?: string) => Promise<void>;
  getApp: () => express.Application;
  getRoutes: () => Router;
};

/**
 * Creates an Express server with the AgentServer integration
 */
export const createExpressServer = (config: AgentServerConfig): ExpressServer => {
  const app = express();
  const agentServer = createAgentServer(config);

  // Detect environment
  const isProduction = process.env.NODE_ENV === 'production';

  // Setup middleware
  app.use(cors({ origin: config.corsOrigin || '*' }));
  app.use(express.json());

  // Add production-specific middleware
  if (isProduction) {
    app.use(helmet());
    app.use(compression());
  }

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Enhanced logging for query endpoint
  app.post<{}, ApiResponse<{ conversationId: string }>, QueryRequest>(
    '/api/query',
    async (req, res) => {
      console.log(
        `[ExpressAdapter] Received POST /api/query for conversation: ${
          req.body.conversationId || 'new'
        }`
      );
      try {
        const queryHandler = createQueryHandler();

        // Use the query handler to process the request
        const result = await queryHandler.handleQuery(req.body, agentServer);

        // Return success response
        console.log(
          `[ExpressAdapter] Successfully processed POST /api/query for conversation: ${result.conversationId}`
        );
        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[ExpressAdapter] Error processing POST /api/query: ${errorMessage}`, error);
        res.status(500).json({
          success: false,
          error: errorMessage,
        });
      }
    }
  );

  // Tool result endpoint
  app.post<{}, ApiResponse<Record<string, never>>, ToolResultRequest>(
    '/api/tool-result',
    async (req, res) => {
      try {
        // Use the tool result handler to process the request
        const result = await toolResultHandler.handleToolResult(req.body, agentServer);

        if (result.success) {
          res.json({ success: true });
        } else {
          res.status(404).json({
            success: false,
            error: 'Conversation or tool request not found',
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).json({
          success: false,
          error: errorMessage,
        });
      }
    }
  );

  // Token usage endpoint
  app.get('/api/token-usage/:conversationId', (async (
    req: Request<{ conversationId: string }>,
    res: Response
  ) => {
    try {
      const { conversationId } = req.params;
      if (!conversationId) {
        res.status(400).json({
          success: false,
          error: 'Missing conversationId parameter',
        });
        return;
      }

      const usage = await agentServer.getContextUsage(conversationId);

      res.json({
        success: true,
        data: usage,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }) as RequestHandler);

  // Cancel request endpoint
  app.post('/api/cancel/:conversationId', ((
    req: Request<{ conversationId: string }>,
    res: Response
  ) => {
    try {
      const { conversationId } = req.params;
      if (!conversationId) {
        res.status(400).json({
          success: false,
          error: 'Missing conversationId parameter',
        });
        return;
      }

      agentServer.cancelRequest(conversationId);

      res.json({
        success: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }) as RequestHandler);

  // SSE endpoint
  app.get('/api/stream', (req, res) => {
    const conversationId = req.query.conversationId as string;

    if (!conversationId) {
      res.status(400).json({
        success: false,
        error: 'Missing conversationId parameter',
      });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Create SSE connection
    const connection: SSEConnection = {
      id: conversationId,
      send: (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      },
      close: () => {
        res.end();
      },
    };

    // Use the stream handler to set up the stream
    streamHandler.setupStream(conversationId, connection, agentServer);

    // Handle client disconnect
    req.on('close', () => {
      console.log(`[ExpressAdapter] SSE stream closed for conversation: ${conversationId}`);
      streamHandler.closeStream(conversationId, agentServer);
    });
  });

  // Providers listing endpoint
  app.get('/api/providers', (_req, res) => {
    // Use the providers handler to get the list of providers
    const result = providersHandler.getProviders();

    res.json({
      success: true,
      data: result,
    });
  });

  // Create router for API routes
  const apiRouter = Router();

  // Add routes to the router
  apiRouter.post('/query', (req, res) => {
    const handler = app._router.stack.find(
      (layer) => layer.route && layer.route.path === '/api/query'
    )?.handle;
    if (handler) {
      return handler(req, res);
    }
    res.status(404).send('Not found');
  });

  apiRouter.post('/tool-result', (req, res) => {
    const handler = app._router.stack.find(
      (layer) => layer.route && layer.route.path === '/api/tool-result'
    )?.handle;
    if (handler) {
      return handler(req, res);
    }
    res.status(404).send('Not found');
  });

  apiRouter.get('/token-usage/:conversationId', (req, res) => {
    const handler = app._router.stack.find(
      (layer) => layer.route && layer.route.path === '/api/token-usage/:conversationId'
    )?.handle;
    if (handler) {
      return handler(req, res);
    }
    res.status(404).send('Not found');
  });

  apiRouter.post('/cancel/:conversationId', (req, res) => {
    const handler = app._router.stack.find(
      (layer) => layer.route && layer.route.path === '/api/cancel/:conversationId'
    )?.handle;
    if (handler) {
      return handler(req, res);
    }
    res.status(404).send('Not found');
  });

  apiRouter.get('/stream', (req, res) => {
    const handler = app._router.stack.find(
      (layer) => layer.route && layer.route.path === '/api/stream'
    )?.handle;
    if (handler) {
      return handler(req, res);
    }
    res.status(404).send('Not found');
  });

  apiRouter.get('/providers', (req, res) => {
    const handler = app._router.stack.find(
      (layer) => layer.route && layer.route.path === '/api/providers'
    )?.handle;
    if (handler) {
      return handler(req, res);
    }
    res.status(404).send('Not found');
  });

  return {
    start: (port = config.port || 3000, host = config.host || 'localhost'): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        try {
          const httpServer = app.listen(port, host, () => {
            console.log(`Server running on http://${host}:${port}`);
            resolve();
          });

          // Handle graceful shutdown
          process.on('SIGTERM', () => {
            console.log(
              '[ExpressAdapter] SIGTERM signal received: attempting graceful shutdown...'
            );
            httpServer.close(() => {
              console.log('[ExpressAdapter] HTTP server closed successfully after SIGTERM.');
            });
          });
        } catch (error) {
          reject(error);
        }
      });
    },
    getApp: () => app,
    getRoutes: () => apiRouter,
  };
};
