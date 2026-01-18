#!/usr/bin/env node

/**
 * OpenCode Auto-Startup Script
 * This runs automatically when OpenCode starts
 */

const path = require('path');
const fs = require('fs');

async function openCodeStartup() {
  const configDir = path.join(process.env.HOME, '.config', 'opencode');
  
  console.log('🚀 OpenCode Auto-Startup');
  console.log('==========================\n');

  try {
    // Check if loader exists
    const loaderPath = path.join(configDir, 'opencode-loader.js');
    
    if (fs.existsSync(loaderPath)) {
      // Load and run the auto-loader
      const OpenCodeAutoLoader = require(loaderPath);
      const loader = new OpenCodeAutoLoader();
      
      // Initialize with full context
      const context = await loader.initialize();
      
      // Return context for current session
      return context;
    } else {
      console.log('⚠️  OpenCode loader not found. Running basic setup...');
      
      // Basic fallback
      console.log('📁 Configuration Directory:', configDir);
      console.log('📝 Quick Setup: cat QUICK_REFERENCE.md');
      console.log('🔧 Automation: ./master-automation.sh');
      
      return null;
    }
  } catch (error) {
    console.error('❌ Startup error:', error.message);
    return null;
  }
}

// Run startup if called directly
if (require.main === module) {
  openCodeStartup().catch(console.error);
}

module.exports = openCodeStartup;