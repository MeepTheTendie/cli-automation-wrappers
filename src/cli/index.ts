#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { securityManager } from '../security/security-manager';
import { configManager } from '../core/config-manager';
import { pluginManager } from '../core/plugin-manager';
import { errorHandler } from '../core/error-handler';
import { auditLogger } from '../security/audit-logger';
import { SetupWizard } from './setup-wizard';

const program = new Command();

program
  .name('sca')
  .description('Security-First CLI Automation Framework')
  .version('2.0.0');

// Initialize command
program
  .command('init')
  .description('Initialize SCA with interactive setup')
  .option('--force', 'Force reinitialization')
  .action(async (options: { force?: boolean }) => {
    const spinner = ora('Initializing SCA...').start();
    
    try {
      await securityManager.initialize();
      await pluginManager.initialize();
      
      spinner.succeed('SCA initialized');
      
      if (options.force) {
        console.log(chalk.yellow('Force mode enabled - existing configuration will be reset'));
      }
      
      // Run setup wizard
      const wizard = new SetupWizard();
      await wizard.run();
      
    } catch (error) {
      spinner.fail('Initialization failed');
      await errorHandler.handleError(error as Error, { operation: 'init' });
      process.exit(1);
    }
  });

// Setup command
program
  .command('setup')
  .description('Run interactive setup wizard')
  .option('--skip-credentials', 'Skip credential setup')
  .action(async (options: { skipCredentials?: boolean }) => {
    try {
      const wizard = new SetupWizard();
      await wizard.run(options.skipCredentials);
      
    } catch (error) {
      console.error(chalk.red('Setup failed:'), error);
      process.exit(1);
    }
  });

// Plugin management commands
const pluginCmd = program
  .command('plugin')
  .description('Plugin management');

pluginCmd
  .command('list')
  .description('List all available plugins')
  .option('--enabled', 'Show only enabled plugins')
  .option('--loaded', 'Show only loaded plugins')
  .action((options: { enabled?: boolean; loaded?: boolean }) => {
    try {
      const plugins = options.loaded 
        ? pluginManager.listLoadedPlugins()
        : options.enabled
        ? pluginManager.listPlugins().filter(p => p.config.enabled)
        : pluginManager.listPlugins();

      console.log(chalk.blue('Available Plugins:'));
      
      if (plugins.length === 0) {
        console.log(chalk.gray('No plugins found'));
        return;
      }

      for (const plugin of plugins) {
        const status = plugin.loaded 
          ? chalk.green('✓ Loaded') 
          : plugin.enabled 
          ? chalk.yellow('○ Enabled') 
          : chalk.gray('✗ Disabled');
        
        console.log(`${status} ${plugin.config.name} v${plugin.config.version}`);
        console.log(`  ${plugin.config.description}`);
        
        if (plugin.lastError) {
          console.log(`  ${chalk.red('Error:')} ${plugin.lastError.message}`);
        }
        console.log();
      }
      
    } catch (error) {
      console.error(chalk.red('Failed to list plugins:'), error);
      process.exit(1);
    }
  });

pluginCmd
  .command('enable <name>')
  .description('Enable a plugin')
  .action(async (name: string) => {
    try {
      await pluginManager.enablePlugin(name);
      console.log(chalk.green(`✓ Plugin "${name}" enabled`));
    } catch (error) {
      console.error(chalk.red(`Failed to enable plugin "${name}":`), error);
      process.exit(1);
    }
  });

pluginCmd
  .command('disable <name>')
  .description('Disable a plugin')
  .action(async (name: string) => {
    try {
      await pluginManager.disablePlugin(name);
      console.log(chalk.yellow(`✓ Plugin "${name}" disabled`));
    } catch (error) {
      console.error(chalk.red(`Failed to disable plugin "${name}":`), error);
      process.exit(1);
    }
  });

pluginCmd
  .command('load <name>')
  .description('Load a plugin')
  .action(async (name: string) => {
    const spinner = ora(`Loading plugin "${name}"...`).start();
    
    try {
      await pluginManager.loadPlugin(name);
      spinner.succeed(`Plugin "${name}" loaded`);
    } catch (error) {
      spinner.fail(`Failed to load plugin "${name}"`);
      console.error(error);
      process.exit(1);
    }
  });

pluginCmd
  .command('unload <name>')
  .description('Unload a plugin')
  .action(async (name) => {
    try {
      await pluginManager.unloadPlugin(name);
      console.log(chalk.yellow(`✓ Plugin "${name}" unloaded`));
    } catch (error) {
      console.error(chalk.red(`Failed to unload plugin "${name}":`), error);
      process.exit(1);
    }
  });

pluginCmd
  .command('execute <name> [args...]')
  .description('Execute a plugin')
  .action(async (name, args) => {
    const spinner = ora(`Executing plugin "${name}"...`).start();
    
    try {
      const result = await pluginManager.executePlugin(name, args);
      spinner.succeed(`Plugin "${name}" executed`);
      
      if (result) {
        console.log(chalk.blue('Result:'), result);
      }
    } catch (error) {
      spinner.fail(`Failed to execute plugin "${name}"`);
      console.error(error);
      process.exit(1);
    }
  });

// Configuration commands
const configCmd = program
  .command('config')
  .description('Configuration management');

configCmd
  .command('get [key]')
  .description('Get configuration value')
  .action(async (key) => {
    try {
      if (key) {
        const value = configManager.get(key);
        console.log(`${chalk.blue(key)}: ${JSON.stringify(value, null, 2)}`);
      } else {
        const config = configManager.getAll();
        console.log(JSON.stringify(config, null, 2));
      }
    } catch (error) {
      console.error(chalk.red('Failed to get configuration:'), error);
      process.exit(1);
    }
  });

configCmd
  .command('set <key> <value>')
  .description('Set configuration value')
  .action(async (key, value) => {
    try {
      // Try to parse as JSON, fallback to string
      let parsedValue: any;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
      
      await configManager.set(key, parsedValue);
      console.log(chalk.green(`✓ Configuration updated: ${key}`));
    } catch (error) {
      console.error(chalk.red('Failed to set configuration:'), error);
      process.exit(1);
    }
  });

configCmd
  .command('reset')
  .description('Reset configuration to defaults')
  .action(async () => {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Are you sure you want to reset all configuration to defaults?',
        default: false
      }
    ]);

    if (!confirmed) {
      console.log(chalk.yellow('Configuration reset cancelled'));
      return;
    }

    try {
      await configManager.reset();
      console.log(chalk.green('✓ Configuration reset to defaults'));
    } catch (error) {
      console.error(chalk.red('Failed to reset configuration:'), error);
      process.exit(1);
    }
  });

configCmd
  .command('export [file]')
  .description('Export configuration to file')
  .action(async (file) => {
    try {
      const config = configManager.exportConfig(true);
      
      if (file) {
        require('fs').writeFileSync(file, config);
        console.log(chalk.green(`✓ Configuration exported to ${file}`));
      } else {
        console.log(config);
      }
    } catch (error) {
      console.error(chalk.red('Failed to export configuration:'), error);
      process.exit(1);
    }
  });

// Security commands
const securityCmd = program
  .command('security')
  .description('Security management');

securityCmd
  .command('store <service> <token>')
  .description('Store a credential securely')
  .action(async (service, token) => {
    try {
      const success = await securityManager.storeCredential(service, token);
      if (success) {
        console.log(chalk.green(`✓ Credential stored for service: ${service}`));
      } else {
        console.log(chalk.red('Failed to store credential'));
      }
    } catch (error) {
      console.error(chalk.red('Failed to store credential:'), error);
      process.exit(1);
    }
  });

securityCmd
  .command('get <service>')
  .description('Retrieve a credential')
  .action(async (service) => {
    try {
      const credential = await securityManager.getCredential(service);
      if (credential) {
        console.log(`${chalk.blue(service)}: ${credential.substring(0, 8)}...`);
      } else {
        console.log(chalk.yellow(`No credential found for service: ${service}`));
      }
    } catch (error) {
      console.error(chalk.red('Failed to retrieve credential:'), error);
      process.exit(1);
    }
  });

securityCmd
  .command('delete <service>')
  .description('Delete a credential')
  .action(async (service) => {
    try {
      const success = await securityManager.deleteCredential(service);
      if (success) {
        console.log(chalk.green(`✓ Credential deleted for service: ${service}`));
      } else {
        console.log(chalk.yellow(`No credential found for service: ${service}`));
      }
    } catch (error) {
      console.error(chalk.red('Failed to delete credential:'), error);
      process.exit(1);
    }
  });

securityCmd
  .command('audit-report [days]')
  .description('Generate security audit report')
  .action(async (days = 7) => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - parseInt(days));

      const report = await auditLogger.generateSecurityReport({
        start: startDate,
        end: endDate
      });

      console.log(report);
    } catch (error) {
      console.error(chalk.red('Failed to generate audit report:'), error);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show system status')
  .action(async () => {
    try {
      console.log(chalk.blue('SCA System Status'));
      console.log();
      
      // Configuration status
      const config = configManager.getAll();
      console.log(`${chalk.green('✓')} Configuration loaded`);
      console.log(`  Working Directory: ${config.workingDir}`);
      console.log(`  Log Level: ${config.logLevel}`);
      console.log(`  Environment: ${config.environment}`);
      console.log();
      
      // Plugin status
      const pluginMetrics = pluginManager.getPluginMetrics();
      console.log(`${chalk.green('✓')} Plugin system active`);
      console.log(`  Total: ${pluginMetrics.total}`);
      console.log(`  Loaded: ${pluginMetrics.loaded}`);
      console.log(`  Enabled: ${pluginMetrics.enabled}`);
      console.log(`  With Errors: ${pluginMetrics.withErrors}`);
      console.log();
      
      // Security status
      console.log(`${chalk.green('✓')} Security manager initialized`);
      console.log(`  Audit Logging: ${config.security.auditEnabled ? 'Enabled' : 'Disabled'}`);
      console.log(`  Log Retention: ${config.security.logRetentionDays} days`);
      console.log();
      
      // Error statistics
      const errorStats = errorHandler.getErrorStats();
      if (errorStats.totalErrors > 0) {
        console.log(`${chalk.yellow('⚠')} Recent errors: ${errorStats.totalErrors}`);
        for (const [operation, count] of Object.entries(errorStats.errorsByOperation)) {
          console.log(`  ${operation}: ${count}`);
        }
      } else {
        console.log(`${chalk.green('✓')} No recent errors`);
      }
      
    } catch (error) {
      console.error(chalk.red('Failed to get status:'), error);
      process.exit(1);
    }
  });

// Global error handler
process.on('uncaughtException', async (error) => {
  console.error(chalk.red('Uncaught Exception:'), error);
  await errorHandler.handleError(error, { operation: 'uncaught_exception' });
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  const error = new Error(`Unhandled rejection at ${promise}: ${reason}`);
  console.error(chalk.red('Unhandled Rejection:'), error);
  await errorHandler.handleError(error, { operation: 'unhandled_rejection' });
  process.exit(1);
});

// Parse command line arguments
program.parse();