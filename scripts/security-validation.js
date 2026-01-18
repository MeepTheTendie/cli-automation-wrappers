#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🔒 Security Validation & Migration Script\n');

// Check for exposed credentials
async function scanForCredentials() {
  console.log('🔍 Scanning for exposed credentials...');
  
  const dangerousPatterns = [
    /token\s*[:=]\s*['"`][a-zA-Z0-9_\-\.]{10,}['"`]/gi,
    /password\s*[:=]\s*['"`][^'"`]{4,}['"`]/gi,
    /secret\s*[:=]\s*['"`][a-zA-Z0-9_\-\.]{10,}['"`]/gi,
    /key\s*[:=]\s*['"`][a-zA-Z0-9_\-\.]{10,}['"`]/gi,
    /api[_-]?key\s*[:=]\s*['"`][a-zA-Z0-9_\-\.]{10,}['"`]/gi,
    /authorization\s*[:=]\s*['"`][Bb]earer\s+[a-zA-Z0-9_\-\.]{10,}['"`]/gi
  ];

  const excludedFiles = [
    'node_modules',
    '.git',
    'dist',
    'coverage',
    'credentials.json.backup',
    'SECURITY_OVERHAUL_PLAN.md'
  ];

  const suspiciousFiles = [];
  
  function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      if (excludedFiles.includes(file)) continue;
      
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.json') || file.endsWith('.md'))) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          
          for (const pattern of dangerousPatterns) {
            const matches = content.match(pattern);
            if (matches) {
              suspiciousFiles.push({
                file: fullPath,
                matches: matches.slice(0, 3) // Limit output
              });
            }
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }
    }
  }
  
  scanDirectory(process.cwd());
  
  if (suspiciousFiles.length === 0) {
    console.log('✅ No exposed credentials found');
  } else {
    console.log('⚠️  Potential credential exposure detected:\n');
    suspiciousFiles.forEach(item => {
      console.log(`📁 ${item.file}:`);
      item.matches.forEach(match => {
        const masked = match.replace(/([a-zA-Z0-9]{4})[a-zA-Z0-9_\-\.]+([a-zA-Z0-9]{4})/, '$1****$2');
        console.log(`   - ${masked}`);
      });
      console.log();
    });
  }
  
  return suspiciousFiles.length === 0;
}

// Check file permissions
function checkFilePermissions() {
  console.log('🔐 Checking file permissions...');
  
  const sensitiveFiles = [
    'credentials.json',
    'credentials.json.backup'
  ];
  
  let secure = true;
  
  for (const file of sensitiveFiles) {
    if (fs.existsSync(file)) {
      try {
        const stat = fs.statSync(file);
        const mode = stat.mode;
        
        // Check if file is readable/writable by others
        if (mode & 0o044) { // Readable by others
          console.log(`⚠️  ${file} is readable by others`);
          secure = false;
        }
        
        if (mode & 0o022) { // Writable by group/others
          console.log(`⚠️  ${file} is writable by group/others`);
          secure = false;
        }
        
        if (secure) {
          console.log(`✅ ${file} has secure permissions`);
        }
      } catch (error) {
        console.log(`❌ Could not check permissions for ${file}`);
        secure = false;
      }
    }
  }
  
  return secure;
}

// Validate .gitignore
function validateGitignore() {
  console.log('📝 Validating .gitignore...');
  
  const gitignorePath = '.gitignore';
  
  if (!fs.existsSync(gitignorePath)) {
    console.log('❌ .gitignore not found');
    return false;
  }
  
  const content = fs.readFileSync(gitignorePath, 'utf8');
  const requiredEntries = [
    'credentials.json',
    'secrets.*',
    '.env',
    'node_modules',
    'dist',
    'coverage'
  ];
  
  let secure = true;
  
  for (const entry of requiredEntries) {
    if (!content.includes(entry)) {
      console.log(`⚠️  ${entry} should be in .gitignore`);
      secure = false;
    }
  }
  
  if (secure) {
    console.log('✅ .gitignore contains required entries');
  }
  
  return secure;
}

// Check package.json security
function validatePackageJson() {
  console.log('📦 Validating package.json security...');
  
  if (!fs.existsSync('package.json')) {
    console.log('❌ package.json not found');
    return false;
  }
  
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    // Check for dangerous scripts
    if (pkg.scripts) {
      const dangerousScripts = [
        'curl',
        'wget',
        'eval',
        'exec',
        'bash',
        'sh',
        'powershell'
      ];
      
      for (const [name, script] of Object.entries(pkg.scripts)) {
        if (typeof script === 'string') {
          for (const dangerous of dangerousScripts) {
            if (script.includes(dangerous)) {
              console.log(`⚠️  Script "${name}" contains potentially dangerous command: ${dangerous}`);
            }
          }
        }
      }
    }
    
    console.log('✅ package.json validated');
    return true;
    
  } catch (error) {
    console.log('❌ Failed to parse package.json');
    return false;
  }
}

// Migration from old system
async function migrateFromOldSystem() {
  console.log('🔄 Checking for migration requirements...');
  
  const oldFiles = [
    'deployment-manager.js',
    'enhanced-automation.js',
    'master-automation.sh'
  ];
  
  let needsMigration = false;
  
  for (const file of oldFiles) {
    if (fs.existsSync(file)) {
      console.log(`📄 Found old file: ${file}`);
      needsMigration = true;
    }
  }
  
  if (needsMigration) {
    console.log('\n💡 Migration suggestions:');
    console.log('1. Backup your current configuration');
    console.log('2. Run "npm run setup" to install the new system');
    console.log('3. Use "sca setup" to configure the new CLI');
    console.log('4. Migrate credentials using the security manager');
    
    // Check for old credentials
    if (fs.existsSync('credentials.json')) {
      console.log('\n🔑 Old credentials detected. The new system will migrate these automatically.');
      console.log('After migration, consider removing the old credentials.json file.');
    }
  } else {
    console.log('✅ No migration required');
  }
}

// Generate security report
async function generateSecurityReport() {
  console.log('\n📊 Generating security report...');
  
  const report = {
    timestamp: new Date().toISOString(),
    scanResults: {
      credentialsExposed: false,
      filePermissionsSecure: false,
      gitignoreValid: false,
      packageJsonValid: false
    },
    recommendations: []
  };
  
  // Run all checks
  report.scanResults.credentialsExposed = await scanForCredentials();
  report.scanResults.filePermissionsSecure = checkFilePermissions();
  report.scanResults.gitignoreValid = validateGitignore();
  report.scanResults.packageJsonValid = validatePackageJson();
  
  // Generate recommendations
  if (!report.scanResults.credentialsExposed) {
    report.recommendations.push('✅ No exposed credentials detected');
  } else {
    report.recommendations.push('🔒 Review and secure any exposed credentials');
  }
  
  if (!report.scanResults.filePermissionsSecure) {
    report.recommendations.push('🔐 Fix file permissions on sensitive files');
  }
  
  if (!report.scanResults.gitignoreValid) {
    report.recommendations.push('📝 Update .gitignore with security entries');
  }
  
  // Save report
  const reportPath = 'security-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`📄 Security report saved to: ${reportPath}`);
  
  return report;
}

// Main execution
async function main() {
  console.log('🚀 Starting security validation...\n');
  
  const report = await generateSecurityReport();
  
  await migrateFromOldSystem();
  
  console.log('\n🎯 Security Summary:');
  
  if (Object.values(report.scanResults).every(result => result)) {
    console.log('🟢 All security checks passed!');
    console.log('\n✅ Your repository is ready for production deployment.');
  } else {
    console.log('🟡 Some security issues detected. Please review the recommendations above.');
    console.log('\n🔧 Run the security validation again after fixing issues.');
  }
  
  console.log('\n📖 For more security guidance, see: README-SECURE.md');
}

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

// Run main function
main().catch(console.error);