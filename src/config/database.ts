import { PrismaClient } from '@prisma/client';
import { structuredLogger } from './logger';

// Create a global variable to store the Prisma client instance
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Create Prisma client instance
export const prisma = globalThis.__prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  datasources: process.env.NODE_ENV === 'test' ? {
    db: {
      url: 'file:./test.db',
    },
  } : undefined,
});

// Store the client in global variable to prevent multiple instances in development
if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// Graceful shutdown
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  structuredLogger.database('Database connection closed');
}

// Database health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    structuredLogger.error('Database health check failed:', error);
    return false;
  }
}

// Initialize database connection
export async function initializeDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    structuredLogger.database('Database connected successfully');
    
    const isHealthy = await checkDatabaseHealth();
    if (!isHealthy) {
      throw new Error('Database health check failed');
    }
  } catch (error) {
    structuredLogger.error('Failed to initialize database:', error);
    throw error;
  }
}