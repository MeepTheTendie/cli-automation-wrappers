#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Setting up Secure CLI Automation Framework...\n');

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion < 18) {
  console.error('❌ Node.js 18 or higher is required');
  process.exit(1);
}

console.log('✓ Node.js version check passed');

// Install dependencies
try {
  console.log('📦 Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
  console.log('✓ Dependencies installed');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error);
  process.exit(1);
}

// Create necessary directories
const dirs = [
  path.join(process.env.HOME || '~', '.secure-cli-automation'),
  path.join(process.env.HOME || '~', '.secure-cli-automation', 'logs'),
  path.join(process.env.HOME || '~', '.secure-cli-automation', 'plugins'),
  path.join(process.env.HOME || '~', '.secure-cli-automation', 'cache')
];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { mode: 0o700, recursive: true });
    console.log(`✓ Created directory: ${dir}`);
  }
}

// Build the project
try {
  console.log('🏗️  Building project...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✓ Build completed');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}

// Create CLI symlink (optional)
try {
  const cliPath = path.join(__dirname, '..', 'dist', 'cli', 'index.js');
  const globalBinPath = path.join('/usr', 'local', 'bin', 'sca');
  
  if (process.platform !== 'win32' && fs.existsSync(cliPath)) {
    try {
      execSync(`ln -sf ${cliPath} ${globalBinPath}`, { stdio: 'pipe' });
      console.log('✓ CLI symlink created (global access with "sca" command)');
    } catch (error) {
      console.log('⚠️  Could not create global symlink (try running with sudo)');
    }
  }
} catch (error) {
  console.log('⚠️  CLI setup skipped');
}

// Run security audit
try {
  console.log('🔒 Running security audit...');
  execSync('npm audit --audit-level high', { stdio: 'pipe' });
  console.log('✓ Security audit passed');
} catch (error) {
  console.log('⚠️  Security audit found issues (run "npm audit fix" to resolve)');
}

// Run tests
try {
  console.log('🧪 Running tests...');
  execSync('npm test', { stdio: 'inherit' });
  console.log('✓ All tests passed');
} catch (error) {
  console.log('⚠️  Some tests failed (check output for details)');
}

console.log('\n🎉 Setup completed successfully!');
console.log('\nNext steps:');
console.log('1. Run "sca setup" for interactive configuration');
console.log('2. Run "sca --help" to see available commands');
console.log('3. Run "sca status" to check system status');
console.log('\nDocumentation: https://github.com/your-org/secure-cli-automation');
console.log('Issues: https://github.com/your-org/secure-cli-automation/issues');