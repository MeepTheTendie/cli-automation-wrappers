// Test setup file
import { configManager } from '../src/core/config-manager';
import { securityManager } from '../src/security/security-manager';

// Mock keytar for testing
jest.mock('keytar', () => ({
  getPassword: jest.fn(),
  setPassword: jest.fn(),
  deletePassword: jest.fn()
}));

// Set test environment
process.env.NODE_ENV = 'test';

// Global test setup
beforeAll(async () => {
  // Initialize managers for testing
  await securityManager.initialize();
  
  // Set test-specific configuration
  await configManager.set('environment', 'test');
  await configManager.set('logLevel', 'error');
  await configManager.set('workingDir', process.cwd());
});

afterAll(async () => {
  // Cleanup test environment
  await configManager.reset();
});