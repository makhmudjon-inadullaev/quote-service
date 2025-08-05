import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  HOST: z.string().default('localhost'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  REDIS_URL: z.string().optional(),
  QUOTABLE_API_URL: z.string().default('https://api.quotable.io'),
  DUMMYJSON_API_URL: z.string().default('https://dummyjson.com'),
  API_TIMEOUT: z.string().transform(Number).default('5000'),
  CACHE_TTL: z.string().transform(Number).default('3600'),
  RATE_LIMIT_MAX: z.string().transform(Number).default('100'),
  RATE_LIMIT_WINDOW: z.string().transform(Number).default('900000'), // 15 minutes
  
  // Production-specific configurations
  GRACEFUL_SHUTDOWN_TIMEOUT: z.string().transform(Number).default('10000'), // 10 seconds
  HEALTH_CHECK_TIMEOUT: z.string().transform(Number).default('5000'), // 5 seconds
  MAX_REQUEST_SIZE: z.string().transform(Number).default('1048576'), // 1MB
  KEEP_ALIVE_TIMEOUT: z.string().transform(Number).default('5000'), // 5 seconds
  
  // Security configurations
  CORS_ORIGIN: z.string().optional(),
  TRUST_PROXY: z.string().transform((val) => val === 'true').default('false'),
  
  // Monitoring configurations
  METRICS_ENABLED: z.string().transform((val) => val === 'true').default('true'),
  REQUEST_ID_HEADER: z.string().default('x-request-id'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    process.exit(1);
  }
  
  return result.data;
}

// Validate required production environment variables
export function validateProductionConfig(config: EnvConfig): void {
  if (config.NODE_ENV === 'production') {
    const requiredProdVars = ['DATABASE_URL'];
    const missing = requiredProdVars.filter(varName => {
      const value = config[varName as keyof EnvConfig];
      return !value || (typeof value === 'string' && value.trim() === '');
    });
    
    if (missing.length > 0) {
      console.error(`❌ Missing required production environment variables: ${missing.join(', ')}`);
      process.exit(1);
    }
  }
}

export const config = validateEnv();
validateProductionConfig(config);