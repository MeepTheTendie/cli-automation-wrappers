import { securityManager } from '../src/security/security-manager';
import { inputValidator } from '../src/security/input-validator';
import { auditLogger } from '../src/security/audit-logger';
import { configManager } from '../src/core/config-manager';
import { pluginManager } from '../src/core/plugin-manager';
import { errorHandler } from '../src/core/error-handler';
import { Plugin } from '../src/core/plugin-manager';

// Mock plugin for testing
class TestPlugin extends Plugin {
  async initialize(): Promise<void> {
    // Mock initialization
  }

  async execute(args: any[]): Promise<any> {
    return { success: true, args };
  }

  async cleanup(): Promise<void> {
    // Mock cleanup
  }
}

describe('Security Manager Tests', () => {
  beforeEach(async () => {
    await securityManager.initialize();
  });

  test('should store and retrieve credentials', async () => {
    const service = 'test-service';
    const token = securityManager.generateSecureRandom(32);
    
    // Store credential
    const storeResult = await securityManager.storeCredential(service, token);
    expect(storeResult).toBe(true);
    
    // Retrieve credential
    const retrieved = await securityManager.getCredential(service);
    expect(retrieved).toBe(token);
    
    // Clean up
    await securityManager.deleteCredential(service);
  });

  test('should validate tokens', async () => {
    const validToken = securityManager.generateSecureRandom(32);
    const invalidToken = 'short';
    
    // Valid token should pass
    await expect(securityManager.storeCredential('valid-test', validToken)).resolves.toBe(true);
    
    // Invalid token should fail
    await expect(securityManager.storeCredential('invalid-test', invalidToken)).rejects.toThrow();
  });

  test('should sanitize errors', () => {
    const error = new Error('Authentication failed: token=secret123');
    const sanitized = securityManager.sanitizeError(error);
    
    expect(sanitized).not.toContain('secret123');
    expect(sanitized).toContain('token=[REDACTED]');
  });

  test('should generate secure random strings', () => {
    const random1 = securityManager.generateSecureRandom();
    const random2 = securityManager.generateSecureRandom();
    
    expect(random1).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(random2).toHaveLength(64);
    expect(random1).not.toBe(random2);
  });
});

describe('Input Validator Tests', () => {
  test('should validate project names', () => {
    const validName = 'my-project-123';
    const invalidName = 'project with spaces!';
    
    const validResult = inputValidator.validateProjectName(validName);
    expect(validResult.isValid).toBe(true);
    expect(validResult.sanitized).toBe('my-project-123');
    
    const invalidResult = inputValidator.validateProjectName(invalidName);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  test('should validate URLs', () => {
    const validUrl = 'https://example.com';
    const invalidUrl = 'not-a-url';
    
    const validResult = inputValidator.validateUrl(validUrl);
    expect(validResult.isValid).toBe(true);
    
    const invalidResult = inputValidator.validateUrl(invalidUrl);
    expect(invalidResult.isValid).toBe(false);
  });

  test('should validate commands for security', () => {
    const safeCommand = 'ls -la';
    const dangerousCommand = 'rm -rf /';
    
    const safeResult = inputValidator.validateCommand(safeCommand);
    expect(safeResult.isValid).toBe(true);
    
    const dangerousResult = inputValidator.validateCommand(dangerousCommand);
    expect(dangerousResult.isValid).toBe(false);
  });

  test('should validate file paths', () => {
    const validPath = '/home/user/project';
    const suspiciousPath = '../../../etc/passwd';
    
    const validResult = inputValidator.validateFilePath(validPath);
    expect(validResult.isValid).toBe(true);
    
    const suspiciousResult = inputValidator.validateFilePath(suspiciousPath);
    expect(suspiciousResult.isValid).toBe(false);
  });
});

describe('Configuration Manager Tests', () => {
  beforeEach(() => {
    // Reset to default config for each test
    configManager.reset();
  });

  test('should get and set configuration values', async () => {
    await configManager.set('test.key', 'test-value');
    const value = configManager.get('test.key');
    
    expect(value).toBe('test-value');
  });

  test('should handle nested configuration', async () => {
    await configManager.set('security.requireAuthentication', true);
    const value = configManager.get('security.requireAuthentication');
    
    expect(value).toBe(true);
  });

  test('should validate working directory', async () => {
    const validDir = process.cwd();
    const invalidDir = '/nonexistent/directory';
    
    const validResult = await configManager.validateWorkingDir(validDir);
    expect(validResult).toBe(true);
    
    const invalidResult = await configManager.validateWorkingDir(invalidDir);
    expect(invalidResult).toBe(false);
  });

  test('should export configuration without secrets', async () => {
    // Set some test configuration
    await configManager.set('test.public', 'public-value');
    await configManager.set('test.secret_token', 'secret123');
    
    const exported = configManager.exportConfig(true);
    const config = JSON.parse(exported);
    
    expect(config.test.public).toBe('public-value');
    expect(config.test.secret_token).toBe('[REDACTED]');
  });
});

describe('Plugin Manager Tests', () => {
  beforeEach(async () => {
    await pluginManager.initialize();
  });

  test('should register and load plugins', async () => {
    const config = {
      name: 'test-plugin',
      version: '1.0.0',
      description: 'Test plugin'
    };
    
    // Register plugin
    await pluginManager.registerPlugin(TestPlugin, config);
    
    // Check registration
    const info = pluginManager.getPluginInfo('test-plugin');
    expect(info).toBeDefined();
    expect(info!.loaded).toBe(false);
    
    // Load plugin
    await pluginManager.loadPlugin('test-plugin');
    
    // Check loading
    const loadedInfo = pluginManager.getPluginInfo('test-plugin');
    expect(loadedInfo!.loaded).toBe(true);
  });

  test('should execute plugins', async () => {
    const config = {
      name: 'execute-test',
      version: '1.0.0',
      description: 'Test plugin execution'
    };
    
    await pluginManager.registerPlugin(TestPlugin, config);
    await pluginManager.loadPlugin('execute-test');
    
    const result = await pluginManager.executePlugin('execute-test', ['arg1', 'arg2']);
    
    expect(result.success).toBe(true);
    expect(result.args).toEqual(['arg1', 'arg2']);
  });

  test('should handle plugin dependencies', async () => {
    const dependencyConfig = {
      name: 'dependency',
      version: '1.0.0',
      description: 'Dependency plugin'
    };
    
    const mainConfig = {
      name: 'main-plugin',
      version: '1.0.0',
      description: 'Main plugin',
      dependencies: ['dependency']
    };
    
    // Register dependency first
    await pluginManager.registerPlugin(TestPlugin, dependencyConfig);
    
    // Register main plugin with dependency
    await pluginManager.registerPlugin(TestPlugin, mainConfig);
    
    // Loading main plugin should automatically load dependency
    await pluginManager.loadPlugin('main-plugin');
    
    // Both should be loaded
    const depInfo = pluginManager.getPluginInfo('dependency');
    const mainInfo = pluginManager.getPluginInfo('main-plugin');
    
    expect(depInfo!.loaded).toBe(true);
    expect(mainInfo!.loaded).toBe(true);
  });

  test('should provide metrics', async () => {
    const configs = [
      { name: 'plugin1', version: '1.0.0', description: 'Test 1' },
      { name: 'plugin2', version: '1.0.0', description: 'Test 2', enabled: false },
      { name: 'plugin3', version: '1.0.0', description: 'Test 3' }
    ];
    
    for (const config of configs) {
      await pluginManager.registerPlugin(TestPlugin, config);
    }
    
    await pluginManager.loadPlugin('plugin1');
    await pluginManager.loadPlugin('plugin3');
    
    const metrics = pluginManager.getPluginMetrics();
    
    expect(metrics.total).toBe(3);
    expect(metrics.enabled).toBe(2);
    expect(metrics.disabled).toBe(1);
    expect(metrics.loaded).toBe(2);
  });
});

describe('Error Handler Tests', () => {
  test('should handle errors with context', async () => {
    const error = new Error('Test error');
    const context = {
      operation: 'test-operation',
      plugin: 'test-plugin',
      args: ['arg1'],
      metadata: { key: 'value' }
    };
    
    // Should not throw
    await expect(errorHandler.handleError(error, context)).resolves.toBeUndefined();
  });

  test('should retry operations', async () => {
    let attempts = 0;
    const operation = jest.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary failure');
      }
      return 'success';
    });
    
    const config = {
      maxAttempts: 3,
      baseDelay: 10,
      maxDelay: 100,
      backoffMultiplier: 2
    };
    
    const context = { operation: 'retry-test' };
    
    const result = await errorHandler.retry(operation, config, context);
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  test('should create automation errors', () => {
    const error = errorHandler.createError(
      'Test automation error',
      'TEST_ERROR',
      { operation: 'test' },
      'high',
      true
    );
    
    expect(error.name).toBe('AutomationError');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.severity).toBe('high');
    expect(error.retryable).toBe(true);
    expect(error.context.operation).toBe('test');
  });

  test('should track error statistics', () => {
    const error1 = new Error('Error 1');
    const error2 = new Error('Error 2');
    
    errorHandler.handleError(error1, { operation: 'test1' });
    errorHandler.handleError(error2, { operation: 'test1' });
    errorHandler.handleError(error1, { operation: 'test2' });
    
    const stats = errorHandler.getErrorStats();
    
    expect(stats.totalErrors).toBe(3);
    expect(stats.errorsByOperation.test1).toBe(2);
    expect(stats.errorsByOperation.test2).toBe(1);
  });
});

describe('Integration Tests', () => {
  test('should perform complete workflow', async () => {
    // Initialize all components
    await securityManager.initialize();
    await pluginManager.initialize();
    
    // Store credential
    await securityManager.storeCredential('integration-test', 'test-token');
    const retrieved = await securityManager.getCredential('integration-test');
    expect(retrieved).toBe('test-token');
    
    // Configure system
    await configManager.set('test.integration', true);
    const configValue = configManager.get('test.integration');
    expect(configValue).toBe(true);
    
    // Register and execute plugin
    const pluginConfig = {
      name: 'integration-plugin',
      version: '1.0.0',
      description: 'Integration test plugin'
    };
    
    await pluginManager.registerPlugin(TestPlugin, pluginConfig);
    await pluginManager.loadPlugin('integration-plugin');
    
    const result = await pluginManager.executePlugin('integration-plugin', ['test']);
    expect(result.success).toBe(true);
    
    // Clean up
    await securityManager.deleteCredential('integration-test');
    await pluginManager.unloadPlugin('integration-plugin');
  });
});