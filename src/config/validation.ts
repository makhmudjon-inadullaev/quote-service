import { config, EnvConfig } from './env';
import { structuredLogger } from './logger';

/**
 * Validate configuration for different environments
 */
export class ConfigValidator {
  private config: EnvConfig;

  constructor(config: EnvConfig) {
    this.config = config;
  }

  /**
   * Validate all configuration settings
   */
  async validateAll(): Promise<boolean> {
    const validations = [
      this.validateEnvironment(),
      this.validateServer(),
      this.validateDatabase(),
      this.validateExternalAPIs(),
      this.validateSecurity(),
      this.validatePerformance(),
    ];

    const results = await Promise.allSettled(validations);
    const failures = results.filter(result => result.status === 'rejected');

    if (failures.length > 0) {
      structuredLogger.error('Configuration validation failed:', {
        failures: failures.map(f => f.status === 'rejected' ? f.reason : null),
      });
      return false;
    }

    structuredLogger.info('✅ All configuration validations passed');
    return true;
  }

  /**
   * Validate environment-specific settings
   */
  private validateEnvironment(): void {
    const { NODE_ENV } = this.config;

    if (!['development', 'production', 'test'].includes(NODE_ENV)) {
      throw new Error(`Invalid NODE_ENV: ${NODE_ENV}`);
    }

    if (NODE_ENV === 'production') {
      this.validateProductionSettings();
    }

    structuredLogger.debug(`Environment validation passed: ${NODE_ENV}`);
  }

  /**
   * Validate production-specific settings
   */
  private validateProductionSettings(): void {
    const requiredProdSettings = {
      DATABASE_URL: this.config.DATABASE_URL,
      HOST: this.config.HOST,
      PORT: this.config.PORT,
    };

    const missing = Object.entries(requiredProdSettings)
      .filter(([_, value]) => !value || (typeof value === 'string' && value.trim() === ''))
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new Error(`Missing required production settings: ${missing.join(', ')}`);
    }

    // Validate production-specific constraints
    if (this.config.HOST === 'localhost' && process.env.DOCKER_ENV !== 'true') {
      structuredLogger.warn('⚠️  Using localhost in production - consider using 0.0.0.0 for containers');
    }

    if (this.config.LOG_LEVEL === 'debug' || this.config.LOG_LEVEL === 'trace') {
      structuredLogger.warn('⚠️  Debug logging enabled in production - consider using info or warn');
    }
  }

  /**
   * Validate server configuration
   */
  private validateServer(): void {
    const { PORT, HOST, MAX_REQUEST_SIZE, KEEP_ALIVE_TIMEOUT } = this.config;

    if (PORT < 1 || PORT > 65535) {
      throw new Error(`Invalid port number: ${PORT}`);
    }

    if (!HOST || HOST.trim() === '') {
      throw new Error('Host cannot be empty');
    }

    if (MAX_REQUEST_SIZE < 1024) { // Minimum 1KB
      throw new Error(`Request size too small: ${MAX_REQUEST_SIZE}`);
    }

    if (KEEP_ALIVE_TIMEOUT < 1000) { // Minimum 1 second
      throw new Error(`Keep alive timeout too small: ${KEEP_ALIVE_TIMEOUT}`);
    }

    structuredLogger.debug('Server configuration validation passed');
  }

  /**
   * Validate database configuration
   */
  private validateDatabase(): void {
    const { DATABASE_URL } = this.config;

    if (!DATABASE_URL || DATABASE_URL.trim() === '') {
      throw new Error('DATABASE_URL is required');
    }

    // Validate database URL format
    if (!DATABASE_URL.startsWith('file:') && 
        !DATABASE_URL.startsWith('postgresql:') && 
        !DATABASE_URL.startsWith('mysql:')) {
      throw new Error(`Unsupported database URL format: ${DATABASE_URL}`);
    }

    structuredLogger.debug('Database configuration validation passed');
  }

  /**
   * Validate external API configuration
   */
  private validateExternalAPIs(): void {
    const { QUOTABLE_API_URL, DUMMYJSON_API_URL, API_TIMEOUT } = this.config;

    const urls = [QUOTABLE_API_URL, DUMMYJSON_API_URL];
    
    for (const url of urls) {
      try {
        new URL(url);
      } catch {
        throw new Error(`Invalid API URL: ${url}`);
      }
    }

    if (API_TIMEOUT < 1000) { // Minimum 1 second
      throw new Error(`API timeout too small: ${API_TIMEOUT}`);
    }

    if (API_TIMEOUT > 30000) { // Maximum 30 seconds
      structuredLogger.warn(`⚠️  API timeout is quite high: ${API_TIMEOUT}ms`);
    }

    structuredLogger.debug('External API configuration validation passed');
  }

  /**
   * Validate security configuration
   */
  private validateSecurity(): void {
    const { NODE_ENV, CORS_ORIGIN, TRUST_PROXY } = this.config;

    if (NODE_ENV === 'production') {
      if (!CORS_ORIGIN) {
        structuredLogger.warn('⚠️  CORS origin not configured for production - allowing all origins');
      }

      if (!TRUST_PROXY) {
        structuredLogger.warn('⚠️  Trust proxy disabled in production - may affect client IP detection');
      }
    }

    structuredLogger.debug('Security configuration validation passed');
  }

  /**
   * Validate performance configuration
   */
  private validatePerformance(): void {
    const { CACHE_TTL, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } = this.config;

    if (CACHE_TTL < 60) { // Minimum 1 minute
      structuredLogger.warn(`⚠️  Cache TTL is very low: ${CACHE_TTL} seconds`);
    }

    if (RATE_LIMIT_MAX < 10) {
      structuredLogger.warn(`⚠️  Rate limit is very restrictive: ${RATE_LIMIT_MAX} requests`);
    }

    if (RATE_LIMIT_WINDOW < 60000) { // Minimum 1 minute
      structuredLogger.warn(`⚠️  Rate limit window is very short: ${RATE_LIMIT_WINDOW}ms`);
    }

    structuredLogger.debug('Performance configuration validation passed');
  }

  /**
   * Get configuration summary for logging
   */
  getConfigSummary(): Record<string, any> {
    return {
      environment: this.config.NODE_ENV,
      server: {
        host: this.config.HOST,
        port: this.config.PORT,
        trustProxy: this.config.TRUST_PROXY,
      },
      database: {
        type: this.config.DATABASE_URL.startsWith('file:') ? 'SQLite' : 'External',
        url: this.config.DATABASE_URL.replace(/\/\/.*@/, '//***@'), // Hide credentials
      },
      cache: {
        enabled: !!this.config.REDIS_URL,
        ttl: this.config.CACHE_TTL,
      },
      rateLimit: {
        max: this.config.RATE_LIMIT_MAX,
        window: this.config.RATE_LIMIT_WINDOW,
      },
      security: {
        cors: this.config.CORS_ORIGIN ? 'configured' : 'permissive',
        helmet: this.config.NODE_ENV === 'production',
      },
      monitoring: {
        metrics: this.config.METRICS_ENABLED,
        logLevel: this.config.LOG_LEVEL,
      },
    };
  }
}

// Export singleton instance
export const configValidator = new ConfigValidator(config);