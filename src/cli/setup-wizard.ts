import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { securityManager } from '../security/security-manager';
import { configManager } from '../core/config-manager';
import { pluginManager } from '../core/plugin-manager';
import { auditLogger } from '../security/audit-logger';
import { inputValidator } from '../security/input-validator';

export class SetupWizard {
  async run(skipCredentials: boolean = false): Promise<void> {
    console.log(chalk.blue.bold('🚀 Secure CLI Automation Setup Wizard'));
    console.log(chalk.gray('This wizard will guide you through the initial setup process.\n'));

    try {
      // Step 1: Basic Configuration
      await this.setupBasicConfig();
      
      // Step 2: Working Directory
      await this.setupWorkingDirectory();
      
      // Step 3: Security Settings
      await this.setupSecurity();
      
      // Step 4: Credentials (optional)
      if (!skipCredentials) {
        await this.setupCredentials();
      }
      
      // Step 5: Plugin Selection
      await this.setupPlugins();
      
      // Step 6: Validation
      await this.validateSetup();
      
      console.log(chalk.green.bold('\n✅ Setup completed successfully!'));
      console.log(chalk.gray('You can now use SCA with: sca --help'));
      
      await auditLogger.logSystemOperation('setup_completed');
      
    } catch (error) {
      console.error(chalk.red('\n❌ Setup failed:'), error);
      await auditLogger.logError(error as Error, 'setup_failed');
      throw error;
    }
  }

  private async setupBasicConfig(): Promise<void> {
    console.log(chalk.blue('📋 Basic Configuration\n'));
    
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'environment',
        message: 'Select environment:',
        choices: [
          { name: 'Development', value: 'development' },
          { name: 'Production', value: 'production' },
          { name: 'Staging', value: 'staging' }
        ],
        default: configManager.get('environment', 'development')
      },
      {
        type: 'list',
        name: 'logLevel',
        message: 'Select log level:',
        choices: [
          { name: 'Debug', value: 'debug' },
          { name: 'Info', value: 'info' },
          { name: 'Warning', value: 'warn' },
          { name: 'Error', value: 'error' }
        ],
        default: configManager.get('logLevel', 'info')
      },
      {
        type: 'confirm',
        name: 'autoFix',
        message: 'Enable automatic issue fixing?',
        default: configManager.get('autoFix', true)
      },
      {
        type: 'confirm',
        name: 'testBeforeDeploy',
        message: 'Run tests before deployment?',
        default: configManager.get('testBeforeDeploy', true)
      }
    ]);

    // Update configuration
    for (const [key, value] of Object.entries(answers)) {
      await configManager.set(key, value);
    }
    
    console.log(chalk.green('✓ Basic configuration saved\n'));
  }

  private async setupWorkingDirectory(): Promise<void> {
    console.log(chalk.blue('📁 Working Directory\n'));
    
    const currentDir = configManager.get('workingDir', process.cwd());
    
    const { workingDir } = await inquirer.prompt([
      {
        type: 'input',
        name: 'workingDir',
        message: 'Enter working directory:',
        default: currentDir,
        validate: async (input: string) => {
          const validation = inputValidator.validateFilePath(input);
          if (!validation.isValid) {
            return validation.errors.join(', ');
          }
          
          // Check if directory exists
          try {
            require('fs').accessSync(validation.sanitized);
            return true;
          } catch {
            return 'Directory does not exist or is not accessible';
          }
        }
      }
    ]);

    await configManager.setWorkingDir(workingDir);
    console.log(chalk.green(`✓ Working directory set to: ${workingDir}\n`));
  }

  private async setupSecurity(): Promise<void> {
    console.log(chalk.blue('🔐 Security Configuration\n'));
    
    const currentSecurity = configManager.get<Record<string, any>>('security', {});
    
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'requireAuthentication',
        message: 'Require authentication for operations?',
        default: currentSecurity.requireAuthentication || false
      },
      {
        type: 'confirm',
        name: 'auditEnabled',
        message: 'Enable audit logging?',
        default: currentSecurity.auditEnabled !== false
      },
      {
        type: 'number',
        name: 'logRetentionDays',
        message: 'Log retention days (1-365):',
        default: currentSecurity.logRetentionDays || 30,
        validate: (input: string) => {
          const num = parseInt(input);
          return (num >= 1 && num <= 365) || 'Please enter a number between 1 and 365';
        }
      }
    ]);

    await configManager.set('security', { ...currentSecurity, ...answers });
    console.log(chalk.green('✓ Security configuration saved\n'));
  }

  private async setupCredentials(): Promise<void> {
    console.log(chalk.blue('🔑 Credential Setup\n'));
    console.log(chalk.gray('You can set up credentials now or skip and configure them later.\n'));
    
    const { setupCredentials } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'setupCredentials',
        message: 'Do you want to set up credentials now?',
        default: false
      }
    ]);

    if (!setupCredentials) {
      console.log(chalk.yellow('Skipping credential setup\n'));
      return;
    }

    const services = [
      { name: 'Vercel', serviceId: 'vercel' },
      { name: 'Render', serviceId: 'render' },
      { name: 'Supabase', serviceId: 'supabase' }
    ];

    for (const service of services) {
      const { setupService } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'setupService',
          message: `Set up ${service.name} credentials?`,
          default: false
        }
      ]);

      if (!setupService) continue;

      const { token } = await inquirer.prompt([
        {
          type: 'password',
          name: 'token',
          message: `Enter ${service.name} token:`,
          mask: '*',
          validate: (input) => {
            const validation = inputValidator.validateToken(input);
            if (!validation.isValid) {
              return validation.errors.join(', ');
            }
            return true;
          }
        }
      ]);

      const spinner = ora(`Storing ${service.name} credentials...`).start();
      
      try {
        await securityManager.storeCredential(service.serviceId, token);
        spinner.succeed(`${service.name} credentials stored`);
      } catch (error) {
        spinner.fail(`Failed to store ${service.name} credentials`);
        console.error(error);
      }
    }
    
    console.log(chalk.green('✓ Credential setup completed\n'));
  }

  private async setupPlugins(): Promise<void> {
    console.log(chalk.blue('🔌 Plugin Setup\n'));
    
    // Show available plugins
    const availablePlugins = await this.getAvailablePlugins();
    
    if (availablePlugins.length === 0) {
      console.log(chalk.yellow('No additional plugins available\n'));
      return;
    }

    const { selectedPlugins } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedPlugins',
        message: 'Select plugins to enable:',
        choices: availablePlugins.map(plugin => ({
          name: `${plugin.name} - ${plugin.description}`,
          value: plugin.name,
          checked: plugin.enabled
        }))
      }
    ]);

    // Update plugin configuration
    const currentPlugins: Array<{ name: string; enabled: boolean; config: Record<string, unknown> }> = configManager.get('plugins', []);
    
    for (const plugin of availablePlugins) {
      const pluginConfig = currentPlugins.find((p) => p.name === plugin.name) || {
        name: plugin.name,
        enabled: false,
        config: {}
      };
      
      pluginConfig.enabled = selectedPlugins.includes(plugin.name);
      
      if (!currentPlugins.find((p) => p.name === plugin.name)) {
        currentPlugins.push(pluginConfig);
      }
    }

    await configManager.set('plugins', currentPlugins);
    
    if (selectedPlugins.length > 0) {
      console.log(chalk.green(`✓ ${selectedPlugins.length} plugin(s) enabled\n`));
    } else {
      console.log(chalk.yellow('No plugins enabled\n'));
    }
  }

  private async validateSetup(): Promise<void> {
    console.log(chalk.blue('🔍 Validating Setup\n'));
    
    const spinner = ora('Validating configuration...').start();
    
    try {
      // Test configuration
      const config = configManager.getAll();
      if (!config.workingDir) {
        throw new Error('Working directory not configured');
      }
      
      // Test security manager
      await securityManager.initialize();
      
      // Test plugin manager
      await pluginManager.initialize();
      
      spinner.succeed('Setup validation passed');
      
    } catch (error) {
      spinner.fail('Setup validation failed');
      throw error;
    }
  }

  private async getAvailablePlugins(): Promise<Array<{
    name: string;
    description: string;
    version: string;
    enabled: boolean;
  }>> {
    // This would typically scan for available plugins
    // For now, return some example plugins
    return [
      {
        name: 'deployment-manager',
        description: 'Manage deployments to various platforms',
        version: '1.0.0',
        enabled: false
      },
      {
        name: 'project-monitor',
        description: 'Monitor project health and performance',
        version: '1.0.0',
        enabled: false
      },
      {
        name: 'backup-automation',
        description: 'Automated backup and recovery',
        version: '1.0.0',
        enabled: false
      }
    ];
  }

  // Quick setup method for automated deployment
  async quickSetup(): Promise<void> {
    const spinner = ora('Performing quick setup...').start();
    
    try {
      // Set basic defaults
      await configManager.set('environment', 'production');
      await configManager.set('logLevel', 'info');
      await configManager.set('autoFix', true);
      await configManager.set('testBeforeDeploy', true);
      
      // Set security defaults
      await configManager.set('security', {
        requireAuthentication: false,
        auditEnabled: true,
        logRetentionDays: 30,
        allowedOrigins: [],
        maxRequestSize: 1024 * 1024 * 10
      });
      
      // Initialize managers
      await securityManager.initialize();
      await pluginManager.initialize();
      
      spinner.succeed('Quick setup completed');
      
      await auditLogger.logSystemOperation('quick_setup_completed');
      
    } catch (error) {
      spinner.fail('Quick setup failed');
      throw error;
    }
  }
}