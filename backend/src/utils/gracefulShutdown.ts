import { Server } from 'http';
import logger from './logger';

export interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  timeout?: number; // Timeout in milliseconds (default: 5000)
}

/**
 * Graceful shutdown manager for Express server and other services
 */
export class GracefulShutdown {
  private static handlers: ShutdownHandler[] = [];
  private static isShuttingDown = false;
  private static shutdownHandlersRegistered = false;

  /**
   * Register a shutdown handler
   */
  static register(handler: ShutdownHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Setup graceful shutdown handlers for the process
   */
  static setup(httpServer?: Server): void {
    if (this.shutdownHandlersRegistered) {
      return;
    }

    this.shutdownHandlersRegistered = true;

    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        return;
      }

      this.isShuttingDown = true;
      logger.info(`${signal} received, shutting down gracefully...`);

      try {
        // Close HTTP server first to free up the port
        if (httpServer) {
          await this.closeHttpServer(httpServer);
        }

        // Execute all registered shutdown handlers
        await this.executeHandlers();

        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Async stream failures should be handled at the route layer; this is a
    // last-resort log so one rejected promise does not take down the API.
    process.on('unhandledRejection', (reason) => {
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : JSON.stringify(reason);
      logger.error('Unhandled promise rejection (process kept alive)', {
        error: message,
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    });

    // Fatal sync exceptions: exit so start-*.sh's backend watchdog can respawn Node.
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception — exiting so process supervisor can restart', {
        error: error?.message,
        stack: error?.stack,
      });
      process.exit(1);
    });
  }

  /**
   * Close HTTP server with timeout
   */
  private static closeHttpServer(server: Server): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn('HTTP server close timeout, forcing shutdown');
        server.closeAllConnections();
        resolve();
      }, 5000);

      server.close(() => {
        clearTimeout(timeout);
        logger.info('HTTP server closed');
        resolve();
      });
    });
  }

  /**
   * Execute all registered shutdown handlers
   */
  private static async executeHandlers(): Promise<void> {
    const promises = this.handlers.map(async (handler) => {
      const timeout = handler.timeout || 5000;
      
      try {
        const handlerPromise = handler.handler();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Handler timeout')), timeout)
        );

        await Promise.race([handlerPromise, timeoutPromise]);
        logger.debug(`Shutdown handler '${handler.name}' completed`);
      } catch (error: any) {
        if (error.message === 'Handler timeout') {
          logger.warn(`Shutdown handler '${handler.name}' timed out after ${timeout}ms`);
        } else {
          logger.error(`Error in shutdown handler '${handler.name}'`, { error });
        }
      }
    });

    await Promise.allSettled(promises);
  }
}

