// Simple console-based logger - no external dependencies needed

// Simple console-based logger for development
const createSimpleLogger = () => {
  const logWithLevel = (level: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logData = data ? ` ${JSON.stringify(data, null, 2)}` : '';
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}${logData}`);
  };

  return {
    info: (message: string, data?: any) => logWithLevel('info', message, data),
    error: (message: string, data?: any) => logWithLevel('error', message, data),
    warn: (message: string, data?: any) => logWithLevel('warn', message, data),
    debug: (message: string, data?: any) => logWithLevel('debug', message, data),
    trace: (message: string, data?: any) => logWithLevel('trace', message, data),
    fatal: (message: string, data?: any) => logWithLevel('fatal', message, data),
  };
};

// For now, use simple logger in development to avoid pino issues
export const logger = createSimpleLogger();

// Enhanced logger with additional methods
export const structuredLogger = {
  ...logger,
  
  // Request logging
  request: (message: string, data?: any) => {
    logger.info(`[REQUEST] ${message}`, data);
  },
  
  // Performance logging
  performance: (message: string, data?: any) => {
    logger.info(`[PERFORMANCE] ${message}`, data);
  },
  
  // Database logging
  database: (message: string, data?: any) => {
    logger.info(`[DATABASE] ${message}`, data);
  },
  
  // Cache logging
  cache: (message: string, data?: any) => {
    logger.debug(`[CACHE] ${message}`, data);
  },
  
  // External API logging
  external: (message: string, data?: any) => {
    logger.info(`[EXTERNAL] ${message}`, data);
  },
  
  // Business logic logging
  business: (message: string, data?: any) => {
    logger.info(`[BUSINESS] ${message}`, data);
  },
  
  // Security logging
  security: (message: string, data?: any) => {
    logger.warn(`[SECURITY] ${message}`, data);
  },
  
  // Audit logging
  audit: (message: string, data?: any) => {
    logger.info(`[AUDIT] ${message}`, data);
  },
  
  // Metrics logging
  metrics: (message: string, data?: any) => {
    logger.debug(`[METRICS] ${message}`, data);
  },
  
  // Health check logging
  health: (message: string, data?: any) => {
    logger.info(`[HEALTH] ${message}`, data);
  },
};

export type Logger = typeof logger;
export type StructuredLogger = typeof structuredLogger;