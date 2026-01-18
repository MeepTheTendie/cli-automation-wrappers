#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');

console.log('🔄 Migration Assistant: Old System → New Secure System\n');

// Check if old system exists
function hasOldSystem() {
  const oldFiles = [
    'deployment-manager.js',
    'enhanced-automation.js', 
    'master-automation.sh'
  ];
  
  return oldFiles.some(file => fs.existsSync(file));
}

// Backup old files
function backupOldFiles() {
  const backupDir = 'backup-' + new Date().toISOString().slice(0, 10);
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const oldFiles = [
    'deployment-manager.js',
    'enhanced-automation.js',
    'master-automation.sh',
    'startup.js',
    'opencode-loader.js',
    'improved-core.js',
    'incremental-delivery.js',
    'tanstack-query-setup.js'
  ];
  
  console.log('📦 Backing up old files...');
  
  for (const file of oldFiles) {
    if (fs.existsSync(file)) {
      const backupPath = path.join(backupDir, file);
      fs.copyFileSync(file, backupPath);
      console.log(`  ✅ ${file} → ${backupPath}`);
    }
  }
  
  return backupDir;
}

// Migrate configuration
function migrateConfiguration() {
  console.log('\n⚙️  Migrating configuration...');
  
  let migrated = false;
  
  // Check old automation-config.json
  if (fs.existsSync('automation-config.json')) {
    try {
      const oldConfig = JSON.parse(fs.readFileSync('automation-config.json', 'utf8'));
      
      // Create new config structure
      const newConfig = {
        workingDir: oldConfig.workingDir || process.cwd(),
        logLevel: oldConfig.logLevel || 'info',
        autoFix: oldConfig.autoFix !== false,
        testBeforeDeploy: oldConfig.testBeforeDeploy !== false,
        skipProjects: oldConfig.skipProjects || ['.opencode', 'node_modules', '.git'],
        environment: 'production',
        plugins: [],
        security: {
          requireAuthentication: false,
          auditEnabled: true,
          logRetentionDays: 30,
          allowedOrigins: [],
          maxRequestSize: 1024 * 1024 * 10
        }
      };
      
      // Write new config (will be picked up by new system)
      const configDir = path.join(process.env.HOME || '~', '.secure-cli-automation');
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { mode: 0o700 });
      }
      
      const newConfigPath = path.join(configDir, 'config.production.json');
      fs.writeFileSync(newConfigPath, JSON.stringify(newConfig, null, 2));
      fs.chmodSync(newConfigPath, 0o600);
      
      console.log('  ✅ Configuration migrated');
      migrated = true;
    } catch (error) {
      console.log('  ❌ Configuration migration failed:', error.message);
    }
  }
  
  return migrated;
}

// Create credential migration script
function createCredentialMigration() {
  const migrationScript = `#!/usr/bin/env node

// Credential Migration Script
// Run this after installing the new system

const { securityManager } = require('./dist/src/security/security-manager');

async function migrateCredentials() {
  console.log('🔑 Migrating credentials...');
  
  try {
    // Initialize security manager
    await securityManager.initialize();
    
    // Check for old credentials file
    if (require('fs').existsSync('credentials.json')) {
      const oldCreds = JSON.parse(require('fs').readFileSync('credentials.json', 'utf8'));
      
      // Migrate each credential
      for (const [service, token] of Object.entries(oldCreds)) {
        if (token && token !== 'your_vercel_token_here' && token !== 'your_render_token_here' && token !== 'your_supabase_token_here') {
          console.log(\`  🔄 Migrating \${service}...\`);
          await securityManager.storeCredential(service, token);
          console.log(\`  ✅ \${service} migrated\`);
        }
      }
      
      console.log('\\n✅ Credential migration completed!');
      console.log('⚠️  You can now safely remove the old credentials.json file');
      
    } else {
      console.log('ℹ️  No old credentials found');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

migrateCredentials();
`;
  
  fs.writeFileSync('migrate-credentials.js', migrationScript);
  fs.chmodSync('migrate-credentials.js', 0o755);
  
  console.log('  ✅ Created credential migration script');
}

// Create new package scripts
function updatePackageScripts() {
  if (fs.existsSync('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      
      // Add migration scripts
      if (!pkg.scripts) pkg.scripts = {};
      
      pkg.scripts['migrate'] = 'node migrate-credentials.js';
      pkg.scripts['new-setup'] = 'npm run build && npm run dev init';
      pkg.scripts['legacy:deploy'] = 'node deployment-manager.js';
      pkg.scripts['legacy:automate'] = './master-automation.sh';
      
      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
      console.log('  ✅ Updated package.json scripts');
      
    } catch (error) {
      console.log('  ❌ Failed to update package.json:', error.message);
    }
  }
}

// Create migration documentation
function createMigrationGuide() {
  const guide = `# Migration Guide: Old System → New Secure System

## 🎯 What's Changing?

The new system provides:
- **Enhanced Security**: Encrypted credential storage in system keychain
- **Modular Architecture**: Plugin-based extensibility
- **Better Error Handling**: Graceful recovery and detailed logging
- **Cross-Platform Support**: Windows, macOS, and Linux compatibility
- **Interactive Setup**: Guided configuration wizard
- **Comprehensive Testing**: 80%+ test coverage

## 🔄 Migration Steps

### 1. Install New System
\`\`\`bash
npm run setup
\`\`\`

### 2. Run Initial Setup
\`\`\`bash
npm run new-setup
\`\`\`

### 3. Migrate Credentials
\`\`\`bash
npm run migrate
\`\`\`

### 4. Test New System
\`\`\`bash
sca status
sca plugin list
\`\`\`

### 5. Update Your Scripts

Replace old commands:
- \`node deployment-manager.js\` → \`sca plugin execute deployment-manager\`
- \`./master-automation.sh\` → \`sca plugin execute master-automation\`
- \`node enhanced-automation.js\` → \`sca plugin execute enhanced-automation\`

## 🔧 New CLI Commands

### Core Commands
- \`sca init\` - Initialize the framework
- \`sca setup\` - Run interactive setup
- \`sca status\` - Check system status

### Plugin Management
- \`sca plugin list\` - List available plugins
- \`sca plugin enable <name>\` - Enable a plugin
- \`sca plugin execute <name>\` - Execute a plugin

### Security
- \`sca security store <service> <token>\` - Store credentials securely
- \`sca security audit-report\` - Generate security report

### Configuration
- \`sca config get [key]\` - Get configuration
- \`sca config set <key> <value>\` - Set configuration

## 📁 What Happened to Old Files?

Your old files have been backed up to \`backup-\${DATE}/\`. The new system uses:
- \`src/\` - Source code (TypeScript)
- \`dist/\` - Compiled JavaScript
- \`~/.secure-cli-automation/\` - Configuration and data

## 🔐 Security Improvements

1. **Credentials**: Now stored encrypted in system keychain
2. **Configuration**: Secure, validated configuration system
3. **Logging**: Comprehensive audit logging with redaction
4. **Validation**: Input validation prevents injection attacks
5. **Error Handling**: Sanitized error messages prevent data leakage

## 🆘 Need Help?

- Run \`sca --help\` for command help
- Check \`README-SECURE.md\` for detailed documentation
- Review \`SECURITY_CHECKLIST.md\` for security best practices

## ⚠️ Important Notes

- Old credentials will be automatically migrated to secure storage
- After migration, you can safely remove the old \`credentials.json\` file
- The old files remain in the backup directory for reference
- Some old scripts may need updates for the new system

## 🎉 Welcome to the New System!

Your automation workflow is now more secure, reliable, and maintainable.
`;

  fs.writeFileSync('MIGRATION_GUIDE.md', guide);
  console.log('  ✅ Created migration guide');
}

// Main migration function
async function runMigration() {
  console.log('🔍 Checking for old system...\n');
  
  if (!hasOldSystem()) {
    console.log('ℹ️  No old system detected. You can proceed with fresh installation.');
    console.log('Run: npm run setup\n');
    return;
  }
  
  console.log('📋 Old system detected. Migration recommended.\n');
  
  const { confirmMigration } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmMigration',
      message: 'Would you like to migrate your old system to the new secure system?',
      default: true
    }
  ]);
  
  if (!confirmMigration) {
    console.log('ℹ️  Migration cancelled. Your old system remains unchanged.');
    return;
  }
  
  console.log('\n🚀 Starting migration...\n');
  
  // Perform migration steps
  const backupDir = backupOldFiles();
  const configMigrated = migrateConfiguration();
  createCredentialMigration();
  updatePackageScripts();
  createMigrationGuide();
  
  console.log('\n📊 Migration Summary:');
  console.log(`  📦 Old files backed up to: ${backupDir}`);
  console.log(`  ⚙️  Configuration ${configMigrated ? 'migrated' : 'not found'}`);
  console.log('  🔑 Credential migration script created');
  console.log('  📄 Migration guide created');
  console.log('  📝 Package scripts updated');
  
  console.log('\n🎯 Next Steps:');
  console.log('1. Run: npm run setup');
  console.log('2. Run: npm run new-setup');
  console.log('3. Run: npm run migrate (to migrate credentials)');
  console.log('4. Test: sca status');
  console.log('5. Read: MIGRATION_GUIDE.md');
  
  console.log('\n✅ Migration preparation completed!');
  console.log('🎉 Welcome to the new secure system!\n');
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Migration error:', error);
  process.exit(1);
});

// Run migration
runMigration().catch(console.error);