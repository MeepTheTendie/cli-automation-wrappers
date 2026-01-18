import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { securityManager } from '../security/security-manager';
import { inputValidator } from '../security/input-validator';
import { auditLogger } from '../security/audit-logger';

export interface AppConfig {
  workingDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  autoFix: boolean;
  testBeforeDeploy: boolean;
  skipProjects: string[];
  environment: string;
  plugins: PluginConfig[];
  security: SecurityConfig;
  [key: string]: any;
}

export interface PluginConfig {
  name: string;
  enabled: boolean;
  config?: Record<string, any>;
}

export interface SecurityConfig {
  requireAuthentication: boolean;
  auditEnabled: boolean;
  logRetentionDays: number;
  allowedOrigins: string[];
  maxRequestSize: number;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;
  private configPath: string;
  private environment: string;

  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.configPath = this.getConfigPath();
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private getConfigPath(): string {
    const configDir = path.join(process.env.HOME || '~', '.secure-cli-automation');
    
    // Create config directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { mode: 0o700 });
    }

    return path.join(configDir, `config.${this.environment}.json`);
  }

  private loadConfig(): AppConfig {
    // Default configuration
    const defaultConfig: AppConfig = {
      workingDir: process.cwd(),
      logLevel: 'info',
      autoFix: true,
      testBeforeDeploy: true,
      skipProjects: ['.opencode', 'node_modules', '.git'],
      environment: this.environment,
      plugins: [],
      security: {
        requireAuthentication: false,
        auditEnabled: true,
        logRetentionDays: 30,
        allowedOrigins: [],
        maxRequestSize: 1024 * 1024 * 10 // 10MB
      }
    };

    try {
      // Try to load existing config
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const loadedConfig = JSON.parse(configData);
        
        // Merge with defaults
        const mergedConfig = { ...defaultConfig, ...loadedConfig };
        
        // Validate configuration
        const validation = this.validateConfig(mergedConfig);
        if (!validation.isValid) {
          console.error('Configuration validation failed:', validation.errors);
          console.log('Using default configuration with invalid fields removed');
          return defaultConfig;
        }
        
        return mergedConfig;
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
      auditLogger.logError(error as Error, 'config_load_failed');
    }

    // Save default config if none exists
    this.saveConfig(defaultConfig);
    return defaultConfig;
  }

  private validateConfig(config: any): { isValid: boolean; errors: string[] } {
    const configSchema = z.object({
      workingDir: z.string().min(1).max(4096),
      logLevel: z.enum(['debug', 'info', 'warn', 'error']),
      autoFix: z.boolean(),
      testBeforeDeploy: z.boolean(),
      skipProjects: z.array(z.string().max(100)),
      environment: z.string().max(50),
      plugins: z.array(z.object({
        name: z.string().min(1).max(100),
        enabled: z.boolean(),
        config: z.record(z.any()).optional()
      })),
      security: z.object({
        requireAuthentication: z.boolean(),
        auditEnabled: z.boolean(),
        logRetentionDays: z.number().min(1).max(365),
        allowedOrigins: z.array(z.string().url()),
        maxRequestSize: z.number().min(1024).max(1024 * 1024 * 100) // 100MB max
      })
    });

    const result = configSchema.safeParse(config);
    
    if (!result.success) {
      return {
        isValid: false,
        errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      };
    }

    return { isValid: true, errors: [] };
  }

  // Get configuration value
  get<T = any>(key: string, defaultValue?: T): T {
    const keys = key.split('.');
    let value = this.config as any;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue as T;
      }
    }

    return value as T;
  }

  // Set configuration value
  async set(key: string, value: any): Promise<void> {
    const keys = key.split('.');
    const lastKey = keys.pop();
    
    if (!lastKey) {
      throw new Error('Invalid configuration key');
    }

    let target = this.config as any;
    for (const k of keys) {
      if (!(k in target) || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k];
    }

    target[lastKey] = value;
    
    // Validate the updated configuration
    const validation = this.validateConfig(this.config);
    if (!validation.isValid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    await this.saveConfig(this.config);
    await auditLogger.logSystemOperation('config_updated', { key });
  }

  // Update multiple configuration values
  async update(updates: Record<string, any>): Promise<void> {
    for (const [key, value] of Object.entries(updates)) {
      await this.set(key, value);
    }
  }

  // Get entire configuration
  getAll(): AppConfig {
    return { ...this.config };
  }

  // Save configuration to file
  private async saveConfig(config: AppConfig): Promise<void> {
    try {
      // Create backup
      if (fs.existsSync(this.configPath)) {
        const backupPath = `${this.configPath}.backup`;
        fs.copyFileSync(this.configPath, backupPath);
      }

      // Write new configuration
      const configJson = JSON.stringify(config, null, 2);
      fs.writeFileSync(this.configPath, configJson, 'utf8');
      
      // Set secure permissions
      fs.chmodSync(this.configPath, 0o600); // Only owner can read/write

      await auditLogger.logSystemOperation('config_saved', {
        path: this.configPath,
        size: configJson.length
      });

    } catch (error) {
      await auditLogger.logError(error as Error, 'config_save_failed', {
        path: this.configPath
      });
      throw error;
    }
  }

  // Reset configuration to defaults
  async reset(): Promise<void> {
    const defaultConfig: AppConfig = {
      workingDir: process.cwd(),
      logLevel: 'info',
      autoFix: true,
      testBeforeDeploy: true,
      skipProjects: ['.opencode', 'node_modules', '.git'],
      environment: this.environment,
      plugins: [],
      security: {
        requireAuthentication: false,
        auditEnabled: true,
        logRetentionDays: 30,
        allowedOrigins: [],
        maxRequestSize: 1024 * 1024 * 10
      }
    };

    this.config = defaultConfig;
    await this.saveConfig(defaultConfig);
    await auditLogger.logSystemOperation('config_reset');
  }

  // Validate working directory
  async validateWorkingDir(dir: string): Promise<boolean> {
    const validation = inputValidator.validateFilePath(dir);
    
    if (!validation.isValid) {
      return false;
    }

    // Check if directory exists and is accessible
    try {
      const stats = fs.statSync(validation.sanitized);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  // Set working directory with validation
  async setWorkingDir(dir: string): Promise<void> {
    const isValid = await this.validateWorkingDir(dir);
    
    if (!isValid) {
      throw new Error(`Invalid working directory: ${dir}`);
    }

    await this.set('workingDir', path.resolve(dir));
  }

  // Get configuration schema for validation
  getConfigSchema(): any {
    return {
      workingDir: {
        type: 'string',
        description: 'Default working directory for operations',
        required: true
      },
      logLevel: {
        type: 'string',
        enum: ['debug', 'info', 'warn', 'error'],
        description: 'Logging level',
        default: 'info'
      },
      autoFix: {
        type: 'boolean',
        description: 'Automatically fix issues when possible',
        default: true
      },
      testBeforeDeploy: {
        type: 'boolean',
        description: 'Run tests before deployment',
        default: true
      },
      skipProjects: {
        type: 'array',
        items: { type: 'string' },
        description: 'Project patterns to skip',
        default: ['.opencode', 'node_modules', '.git']
      },
      plugins: {
        type: 'array',
        description: 'Plugin configurations',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            enabled: { type: 'boolean' },
            config: { type: 'object' }
          }
        }
      },
      security: {
        type: 'object',
        properties: {
          requireAuthentication: { type: 'boolean' },
          auditEnabled: { type: 'boolean' },
          logRetentionDays: { type: 'number', minimum: 1, maximum: 365 },
          allowedOrigins: { type: 'array', items: { type: 'string', format: 'uri' } },
          maxRequestSize: { type: 'number', minimum: 1024 }
        }
      }
    };
  }

  // Export configuration for sharing
  exportConfig(excludeSecrets: boolean = true): string {
    const config = { ...this.config };

    if (excludeSecrets) {
      // Remove sensitive fields
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential'];
      
      const removeSecrets = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) {
          return obj;
        }

        const cleaned: any = Array.isArray(obj) ? [] : {};
        
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          
          if (sensitiveKeys.some(s => lowerKey.includes(s))) {
            cleaned[key] = '[REDACTED]';
          } else if (typeof value === 'object') {
            cleaned[key] = removeSecrets(value);
          } else {
            cleaned[key] = value;
          }
        }
        
        return cleaned;
      };

      return JSON.stringify(removeSecrets(config), null, 2);
    }

    return JSON.stringify(config, null, 2);
  }

  // Import configuration
  async importConfig(configJson: string, merge: boolean = false): Promise<void> {
    try {
      const importedConfig = JSON.parse(configJson);
      
      // Validate imported configuration
      const validation = this.validateConfig(importedConfig);
      if (!validation.isValid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      if (merge) {
        // Merge with existing configuration
        this.config = { ...this.config, ...importedConfig };
      } else {
        // Replace entire configuration
        this.config = importedConfig;
      }

      await this.saveConfig(this.config);
      await auditLogger.logSystemOperation('config_imported', { merge });

    } catch (error) {
      await auditLogger.logError(error as Error, 'config_import_failed');
      throw error;
    }
  }

  // Get environment-specific configuration
  getEnvironmentConfig(env?: string): AppConfig {
    const targetEnv = env || this.environment;
    
    if (targetEnv === this.environment) {
      return this.config;
    }

    // Load environment-specific config
    const envConfigPath = path.join(
      path.dirname(this.configPath),
      `config.${targetEnv}.json`
    );

    if (fs.existsSync(envConfigPath)) {
      try {
        const envConfigData = fs.readFileSync(envConfigPath, 'utf8');
        return JSON.parse(envConfigData);
      } catch (error) {
        console.error(`Failed to load ${targetEnv} configuration:`, error);
      }
    }

    // Return current config as fallback
    return this.config;
  }
}

export const configManager = ConfigManager.getInstance();