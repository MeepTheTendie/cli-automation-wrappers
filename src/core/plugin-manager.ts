import { securityManager } from '../security/security-manager';
import { inputValidator } from '../security/input-validator';
import { auditLogger } from '../security/audit-logger';
import { EventEmitter } from 'events';

export interface PluginConfig {
  name: string;
  version: string;
  description: string;
  dependencies?: string[];
  permissions?: string[];
  enabled?: boolean;
}

export interface PluginContext {
  config: PluginConfig;
  logger: typeof auditLogger;
  security: typeof securityManager;
  validator: typeof inputValidator;
  emit: (event: string, data: any) => void;
}

export abstract class Plugin extends EventEmitter {
  protected config: PluginConfig;
  protected context!: PluginContext;

  constructor(config: PluginConfig) {
    super();
    this.config = config;
  }

  // Abstract methods that plugins must implement
  abstract initialize(context: PluginContext): Promise<void>;
  abstract execute(args: any[]): Promise<any>;
  abstract cleanup(): Promise<void>;

  // Optional methods with default implementations
  async validate(args: any[]): Promise<boolean> {
    return true;
  }

  getConfig(): PluginConfig {
    return this.config;
  }

  getName(): string {
    return this.config.name;
  }
}

export interface PluginMetadata {
  plugin: typeof Plugin;
  instance?: Plugin | undefined;
  config: PluginConfig;
  loaded: boolean;
  enabled: boolean;
  lastError?: Error | undefined;
}

export class PluginManager extends EventEmitter {
  private plugins: Map<string, PluginMetadata> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await securityManager.initialize();
    this.initialized = true;

    await auditLogger.logSystemOperation('plugin_manager_initialized');
  }

  // Register a plugin
  async registerPlugin(pluginClass: typeof Plugin, config: PluginConfig): Promise<void> {
    await this.ensureInitialized();

    // Validate plugin configuration
    const validation = inputValidator.validateConfig(config);
    if (!validation.isValid) {
      throw new Error(`Invalid plugin configuration: ${validation.errors.join(', ')}`);
    }

    // Check for duplicates
    if (this.plugins.has(config.name)) {
      throw new Error(`Plugin ${config.name} is already registered`);
    }

    // Check dependencies
    if (config.dependencies) {
      await this.checkDependencies(config.dependencies);
    }

    // Register plugin metadata
    this.plugins.set(config.name, {
      plugin: pluginClass,
      config,
      loaded: false,
      enabled: config.enabled !== false
    });

    await auditLogger.logPluginAction(config.name, 'registered', {
      version: config.version,
      dependencies: config.dependencies
    });

    this.emit('pluginRegistered', config.name);
  }

  // Load a plugin
  async loadPlugin(name: string): Promise<void> {
    await this.ensureInitialized();

    const metadata = this.plugins.get(name);
    if (!metadata) {
      throw new Error(`Plugin ${name} not found`);
    }

    if (metadata.loaded) {
      return; // Already loaded
    }

    if (!metadata.enabled) {
      throw new Error(`Plugin ${name} is disabled`);
    }

    try {
      // Create plugin instance
      const instance = new (metadata.plugin as unknown as new (config: PluginConfig) => Plugin)(metadata.config);

      // Create plugin context
      const context: PluginContext = {
        config: metadata.config,
        logger: auditLogger,
        security: securityManager,
        validator: inputValidator,
        emit: (event: string, data: any) => {
          this.emit(`plugin:${name}:${event}`, data);
        }
      };

      // Initialize plugin
      await instance.initialize(context);

      // Update metadata
      metadata.instance = instance;
      metadata.loaded = true;

      await auditLogger.logPluginAction(name, 'loaded');
      this.emit('pluginLoaded', name);

    } catch (error) {
      metadata.lastError = error as Error;
      await auditLogger.logError(error as Error, `plugin_load_${name}`);
      throw error;
    }
  }

  // Unload a plugin
  async unloadPlugin(name: string): Promise<void> {
    await this.ensureInitialized();

    const metadata = this.plugins.get(name);
    if (!metadata) {
      throw new Error(`Plugin ${name} not found`);
    }

    if (!metadata.loaded) {
      return; // Already unloaded
    }

    try {
      if (metadata.instance) {
        await metadata.instance.cleanup();
        metadata.instance.removeAllListeners();
      }

      metadata.loaded = false;
      metadata.instance = undefined;
      metadata.lastError = undefined;

      await auditLogger.logPluginAction(name, 'unloaded');
      this.emit('pluginUnloaded', name);

    } catch (error) {
      metadata.lastError = error as Error;
      await auditLogger.logError(error as Error, `plugin_unload_${name}`);
      throw error;
    }
  }

  // Execute a plugin
  async executePlugin(name: string, args: any[] = []): Promise<any> {
    await this.ensureInitialized();

    const metadata = this.plugins.get(name);
    if (!metadata) {
      throw new Error(`Plugin ${name} not found`);
    }

    if (!metadata.loaded) {
      await this.loadPlugin(name);
    }

    if (!metadata.instance) {
      throw new Error(`Plugin ${name} instance not available`);
    }

    try {
      // Validate arguments
      const isValid = await metadata.instance.validate(args);
      if (!isValid) {
        throw new Error(`Invalid arguments for plugin ${name}`);
      }

      // Execute plugin
      const result = await metadata.instance.execute(args);

      await auditLogger.logPluginAction(name, 'executed', {
        argCount: args.length,
        success: true
      });

      this.emit('pluginExecuted', { name, result });
      return result;

    } catch (error) {
      await auditLogger.logError(error as Error, `plugin_execute_${name}`, {
        argCount: args.length
      });
      throw error;
    }
  }

  // Enable/disable plugin
  async enablePlugin(name: string): Promise<void> {
    const metadata = this.plugins.get(name);
    if (!metadata) {
      throw new Error(`Plugin ${name} not found`);
    }

    metadata.enabled = true;
    await auditLogger.logPluginAction(name, 'enabled');
    this.emit('pluginEnabled', name);
  }

  async disablePlugin(name: string): Promise<void> {
    const metadata = this.plugins.get(name);
    if (!metadata) {
      throw new Error(`Plugin ${name} not found`);
    }

    // Unload if currently loaded
    if (metadata.loaded) {
      await this.unloadPlugin(name);
    }

    metadata.enabled = false;
    await auditLogger.logPluginAction(name, 'disabled');
    this.emit('pluginDisabled', name);
  }

  // Get plugin information
  getPluginInfo(name: string): PluginMetadata | undefined {
    return this.plugins.get(name);
  }

  // List all plugins
  listPlugins(): PluginMetadata[] {
    return Array.from(this.plugins.values());
  }

  // List loaded plugins
  listLoadedPlugins(): PluginMetadata[] {
    return Array.from(this.plugins.values()).filter(p => p.loaded);
  }

  // Check dependencies
  private async checkDependencies(dependencies: string[]): Promise<void> {
    for (const dep of dependencies) {
      const depMetadata = this.plugins.get(dep);
      if (!depMetadata) {
        throw new Error(`Dependency ${dep} not found`);
      }

      if (!depMetadata.enabled) {
        throw new Error(`Dependency ${dep} is disabled`);
      }

      // Load dependency if not already loaded
      if (!depMetadata.loaded) {
        await this.loadPlugin(dep);
      }
    }
  }

  // Load all enabled plugins
  async loadAllPlugins(): Promise<void> {
    const enabledPlugins = Array.from(this.plugins.values())
      .filter(p => p.enabled)
      .sort((a, b) => {
        // Sort by dependencies (plugins with fewer deps load first)
        const aDeps = a.config.dependencies?.length || 0;
        const bDeps = b.config.dependencies?.length || 0;
        return aDeps - bDeps;
      });

    for (const metadata of enabledPlugins) {
      try {
        await this.loadPlugin(metadata.config.name);
      } catch (error) {
        console.error(`Failed to load plugin ${metadata.config.name}:`, error);
      }
    }
  }

  // Unload all plugins
  async unloadAllPlugins(): Promise<void> {
    const loadedPlugins = this.listLoadedPlugins();
    
    // Unload in reverse order
    for (const metadata of loadedPlugins.reverse()) {
      try {
        await this.unloadPlugin(metadata.config.name);
      } catch (error) {
        console.error(`Failed to unload plugin ${metadata.config.name}:`, error);
      }
    }
  }

  // Get plugin metrics
  getPluginMetrics(): {
    total: number;
    loaded: number;
    enabled: number;
    disabled: number;
    withErrors: number;
  } {
    const plugins = Array.from(this.plugins.values());
    
    return {
      total: plugins.length,
      loaded: plugins.filter(p => p.loaded).length,
      enabled: plugins.filter(p => p.enabled).length,
      disabled: plugins.filter(p => !p.enabled).length,
      withErrors: plugins.filter(p => p.lastError).length
    };
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    await this.unloadAllPlugins();
    this.plugins.clear();
    this.initialized = false;
    
    await auditLogger.logSystemOperation('plugin_manager_cleanup');
  }
}

export const pluginManager = new PluginManager();