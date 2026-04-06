import { PrismaClient, Prisma } from '@prisma/client';
import logger from '../utils/logger';
import { sourceSystemEncryptionMiddleware } from './integrations/shared/prisma-encryption-middleware';

const prismaClientOptions: {
  log?: Array<{ emit: 'event'; level: 'query' | 'error' | 'info' | 'warn' }>;
  transactionOptions?: { maxWait: number; timeout: number };
} = {
  log: process.env.PRISMA_SHOW_QUERY === 'true' ? [
    {
      emit: 'event' as const,
      level: 'query' as const,
    },
    {
      emit: 'event' as const,
      level: 'error' as const,
    },
    {
      emit: 'event' as const,
      level: 'info' as const,
    },
    {
      emit: 'event' as const,
      level: 'warn' as const,
    },
  ] : [],
  transactionOptions: {
    maxWait: 10000, // 10 seconds
    timeout: 60000, // 60 seconds
  }
};

const prisma = new PrismaClient(prismaClientOptions);

// Enable custom encryption middleware for source_system.connection_config
// Uses AES-256-CBC encryption (compatible with Python DBT decryption)
prisma.$use(sourceSystemEncryptionMiddleware());

if (process.env.PRISMA_SHOW_QUERY === 'true') {
  (prisma as any).$on('query', (e: any) => {
    logger.warn('Prisma Query', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
      timestamp: new Date().toISOString()
    });
  });

  (prisma as any).$on('error', (e: any) => {
    logger.error('Prisma Error', {
      error: e.message,
      timestamp: new Date().toISOString()
    });
  });
}

export default prisma; 