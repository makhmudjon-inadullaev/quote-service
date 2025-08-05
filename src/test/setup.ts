import { execSync } from 'child_process';
import { config } from '../config/env';

// Set test environment
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'silent';
process.env['DATABASE_URL'] = 'file:./test.db';

// Global test timeout
jest.setTimeout(10000);

// Setup test database before all tests
beforeAll(async () => {
  try {
    // Run database migrations for test database
    execSync('npx prisma migrate deploy', { 
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: 'file:./test.db' }
    });
  } catch (error) {
    console.error('Failed to setup test database:', error);
  }
});

// Mock console methods in test environment
if (config.NODE_ENV === 'test') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}