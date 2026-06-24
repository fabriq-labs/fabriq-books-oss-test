import 'reflect-metadata';
import express, { Express } from 'express';
import { Server } from 'http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { json } from 'body-parser';
import cors from 'cors';
import { ModelRegistry } from './models/ModelRegistry';
import { SchemaBuilder } from './schema/SchemaBuilder';
import { PrismaSchemaParser } from './utils/PrismaSchemaParser';
import { authMiddleware } from './auth/middleware';
import { AuthContext } from './auth/types';
import { setupRestRoutes } from './rest/routes';
import { errorHandler } from './rest/middleware/errorHandler';
import agentModule from './agent';
import { createChatRouter } from './routes/chat';
import { createBrokerSyncRouter } from './routes/broker-sync';
import { GracefulShutdown } from './utils/gracefulShutdown';
import { ensureDatabaseViews } from './utils/setup/ensureDatabaseViews';
import { initializeImportExtensions } from './lib/import-extensions';
import './rest/postingCustomActions'; // registers posting/import-bank-statement custom action
import './services/book-keeping/migration-journal'; // registers setup/migration-journal custom actions
import { mcpRouter } from './mcp/McpRouter';
import { createPlaidRouter } from './plaid/plaid.routes';

const app: Express = express();
const port: number = parseInt(process.env.BACKEND_PORT || process.env.PORT || '4000', 10);
let httpServer: Server | null = null;

async function startServer(): Promise<void> {
  try {
    await ensureDatabaseViews();

    // Initialize import extensions (model-specific import behaviors)
    initializeImportExtensions();

    // Initialize model registry and parse entities
    const modelRegistry = ModelRegistry.getInstance();
    const schemaParser = new PrismaSchemaParser();
    const entities = schemaParser.parseModels();

    // Register each entity
    entities.forEach((entity) => {
      modelRegistry.registerEntity(entity);
    });

    // Build GraphQL schema
    const schemaBuilder = new SchemaBuilder();
    const schema = schemaBuilder.buildSchema();

    // Create Apollo Server
    const apolloServer = new ApolloServer<{ auth?: AuthContext }>({
      schema,
      introspection: true,
    });

    await apolloServer.start();

    // Apply middleware
    app.use(cors());

    // Setup Slack routes BEFORE JSON middleware (needs raw body for signature verification)
    const { createSlackRouter } = await import('./agent/slack/routes');
    app.use('/api/slack', createSlackRouter());

    // Apply JSON middleware for other routes
    app.use(json({ limit: process.env.REQUEST_BODY_LIMIT || '25mb' }));

    // Setup REST routes
    const router = express.Router();
    setupRestRoutes(router);
    app.use('/api', router);

    // Setup Agent routes
    app.use('/api/agent', agentModule.createAgentRouter());

    // Persisted financial chat (Vercel AI SDK useChat + chat_threads)
    app.use('/api/chat', createChatRouter());

    // Broker forward sync (Questrade)
    app.use('/api/broker-sync', createBrokerSyncRouter());

    // MCP endpoint
    app.use('/api/mcp', mcpRouter);

    // Plaid bank feed integration
    app.use('/api/plaid', createPlaidRouter());

    // GraphQL endpoint with authentication
    app.use(
      '/graphql',
      authMiddleware,
      expressMiddleware(apolloServer, {
        context: async ({ req }) => {
          return (req as any).context?.auth;
        },
      })
    );

    // Error handling middleware
    app.use(errorHandler);

    // Load agent model tool config (Super Admin UI → ToolManager)
    const { warmAgentModelToolCache } = await import('./agent/agentModelToolConfigCache');
    await warmAgentModelToolCache();

    // Start HTTP server
    httpServer = app.listen(port, () => {
      console.log(`🚀 Server ready at http://localhost:${port}`);
      console.log(`📡 GraphQL endpoint: http://localhost:${port}/graphql`);
      console.log(`📡 REST API endpoint: http://localhost:${port}/api`);
      console.log(`🤖 Agent endpoint: http://localhost:${port}/agent/request`);
    });

    // Setup graceful shutdown handlers
    GracefulShutdown.setup(httpServer);

  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

startServer(); 