import { buildApp } from './app';
import { config } from './config/env';
import { structuredLogger } from './config/logger';
import { checkDatabaseHealth } from './config/database';
import { configValidator } from './config/validation';

// Application state management
let isShuttingDown = false;
let server: any = null;

/**
 * Perform application health checks before startup
 */
async function performStartupChecks(): Promise<void> {
  structuredLogger.info('Performing startup health checks...');
  
  // Validate configuration
  const configValid = await configValidator.validateAll();
  if (!configValid) {
    throw new Error('Configuration validation failed');
  }

  // Log configuration summary
  structuredLogger.info('Configuration summary:', configValidator.getConfigSummary());
  
  // Check database connectivity
  const dbHealthy = await checkDatabaseHealth();
  if (!dbHealthy) {
    throw new Error('Database health check failed during startup');
  }
  
  structuredLogger.info('✅ All startup health checks passed');
}

/**
 * Initialize and start the application
 */
async function start(): Promise<void> {
  try {
    structuredLogger.info(`🚀 Starting Quote Service v${process.env.npm_package_version || '1.0.0'}`);
    structuredLogger.info(`📊 Environment: ${config.NODE_ENV}`);
    structuredLogger.info(`🔧 Configuration loaded successfully`);

    // Perform startup health checks
    await performStartupChecks();

    // Build and configure the application
    const app = await buildApp();
    server = app;

    // Configure server options for production
    const serverOptions = {
      port: config.PORT,
      host: config.HOST,
      ...(config.NODE_ENV === 'production' && {
        keepAliveTimeout: config.KEEP_ALIVE_TIMEOUT,
        maxRequestsPerSocket: 0, // No limit
        requestTimeout: config.HEALTH_CHECK_TIMEOUT * 2, // 10 seconds
      }),
    };

    // Start the server
    await app.listen(serverOptions);

    structuredLogger.info(`🚀 Quote Service started successfully!`);
    structuredLogger.info(`📍 Server running at http://${config.HOST}:${config.PORT}`);
    structuredLogger.info(`🏥 Health check: http://${config.HOST}:${config.PORT}/health`);
    structuredLogger.info(`📈 GraphQL playground: http://${config.HOST}:${config.PORT}/graphiql`);
    structuredLogger.info(`🔒 Trust proxy: ${config.TRUST_PROXY}`);
    structuredLogger.info(`📊 Metrics enabled: ${config.METRICS_ENABLED}`);

  } catch (error) {
    structuredLogger.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    structuredLogger.warn('Shutdown already in progress, forcing exit...');
    process.exit(1);
  }

  isShuttingDown = true;
  structuredLogger.info(`Received ${signal}, initiating graceful shutdown...`);

  // Set a timeout for forced shutdown
  const forceShutdownTimer = setTimeout(() => {
    structuredLogger.error('Graceful shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, config.GRACEFUL_SHUTDOWN_TIMEOUT);

  try {
    if (server) {
      structuredLogger.info('Closing HTTP server...');
      await server.close();
      structuredLogger.info('✅ HTTP server closed successfully');
    }

    // Clear the force shutdown timer
    clearTimeout(forceShutdownTimer);
    
    structuredLogger.info('✅ Graceful shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    structuredLogger.error('Error during graceful shutdown:', error);
    clearTimeout(forceShutdownTimer);
    process.exit(1);
  }
}

/**
 * Setup process event handlers
 */
function setupProcessHandlers(): void {
  // Graceful shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection:', {
      reason,
      promise: promise.toString(),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    
    if (config.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    // Always exit on uncaught exceptions
    process.exit(1);
  });

  // Handle process warnings
  process.on('warning', (warning) => {
    console.warn('Process Warning:', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
    });
  });
}

// Setup process handlers
setupProcessHandlers();

// Start the application
void start();