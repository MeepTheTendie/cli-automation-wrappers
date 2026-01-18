#!/usr/bin/env node

/**
 * OpenCode Auto-Loader
 * Automatically loads user context and preferences on startup
 */

const fs = require('fs');
const path = require('path');

class OpenCodeAutoLoader {
  constructor() {
    this.contextPath = path.join(process.env.HOME, '.config', 'opencode');
    this.sessionContext = null;
    this.userPreferences = null;
  }

  async initialize() {
    console.log('🚀 OpenCode - Initializing with saved context...\n');

    // Load session context
    await this.loadSessionContext();
    
    // Load user preferences  
    await this.loadUserPreferences();
    
    // Display summary
    this.displayContextSummary();
    
    // Suggest actions
    this.suggestActions();

    console.log('\n✅ OpenCode ready with full context!');
    return this.sessionContext;
  }

  async loadSessionContext() {
    const contextFile = path.join(this.contextPath, 'SESSION_CONTEXT_COMPLETE.md');
    
    try {
      if (fs.existsSync(contextFile)) {
        const content = fs.readFileSync(contextFile, 'utf8');
        this.sessionContext = this.parseMarkdownContext(content);
        console.log('📝 Loaded session context');
      } else {
        console.log('ℹ️  No previous session context found');
        this.sessionContext = this.createNewUserSession();
      }
    } catch (error) {
      console.log('⚠️  Error loading context, using defaults');
      this.sessionContext = this.createNewUserSession();
    }
  }

  async loadUserPreferences() {
    const quickRefFile = path.join(this.contextPath, 'QUICK_REFERENCE.md');
    
    try {
      if (fs.existsSync(quickRefFile)) {
        const content = fs.readFileSync(quickRefFile, 'utf8');
        this.userPreferences = this.parseQuickReference(content);
        console.log('⚙️  Loaded user preferences');
      }
    } catch (error) {
      console.log('⚠️  Error loading preferences');
    }
  }

  parseMarkdownContext(content) {
    // Extract key information from markdown
    const sections = content.split('## ');
    const context = {};

    sections.forEach(section => {
      const lines = section.split('\n');
      const title = lines[0]?.trim();
      
      if (title) {
        context[title] = {
          title,
          content: lines.slice(1).join('\n'),
          keyInfo: this.extractKeyInfo(lines)
        };
      }
    });

    return context;
  }

  extractKeyInfo(lines) {
    const info = {};
    
    lines.forEach(line => {
      if (line.includes('User Stack:')) {
        const stackMatch = line.match(/\*\*User Stack\*\*:\s*(.+)/);
        if (stackMatch) info.stack = stackMatch[1];
      }
      if (line.includes('Projects:')) {
        const projectsMatch = line.match(/\*\*Projects\*\*:\s*(.+)/);
        if (projectsMatch) info.projects = projectsMatch[1];
      }
      if (line.includes('Session Date:')) {
        const dateMatch = line.match(/\*\*Session Date\*\*:\s*(.+)/);
        if (dateMatch) info.lastSession = dateMatch[1];
      }
    });

    return info;
  }

  parseQuickReference(content) {
    // Extract user's tech stack and preferences
    const preferences = {
      stack: {},
      commands: {},
      status: {}
    };

    const lines = content.split('\n');
    let currentSection = null;

    lines.forEach(line => {
      if (line.includes('🎯 **User Tech Stack**')) {
        currentSection = 'stack';
      } else if (line.includes('🚀 **Essential Automation Commands**')) {
        currentSection = 'commands';
      } else if (line.includes('📊 **Current Project Status**')) {
        currentSection = 'status';
      } else if (currentSection && line.includes('- **')) {
        const match = line.match(/- \*\*(.+)\*\*:\s*(.+)/);
        if (match) {
          preferences[currentSection][match[1]] = match[2];
        }
      }
    });

    return preferences;
  }

  createNewUserSession() {
    return {
      'NEW SESSION': {
        title: 'NEW SESSION',
        content: 'No previous context available. Starting fresh.',
        keyInfo: {
          stack: 'Node.js + npm + Vite + TypeScript + TanStack',
          projects: 'iron-tracker, toku-tracker',
          lastSession: 'First session or context reset'
        }
      }
    };
  }

  displayContextSummary() {
    console.log('📋 CONTEXT SUMMARY\n');
    
    // Display last session info
    if (this.sessionContext) {
      const firstSection = Object.values(this.sessionContext)[0];
      if (firstSection?.keyInfo) {
        console.log('🗺️  Previous Session:');
        console.log(`   Date: ${firstSection.keyInfo.lastSession || 'Unknown'}`);
        console.log(`   Stack: ${firstSection.keyInfo.stack || 'Unknown'}`);
        console.log(`   Projects: ${firstSection.keyInfo.projects || 'Unknown'}`);
      }
    }

    // Display current preferences
    if (this.userPreferences?.status) {
      console.log('\n📊 Current Status:');
      Object.entries(this.userPreferences.status).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
    }
  }

  suggestActions() {
    console.log('\n🎯 SUGGESTED ACTIONS:');
    
    if (this.userPreferences?.commands) {
      console.log('🚀 Common Commands:');
      Object.entries(this.userPreferences.commands).slice(0, 3).forEach(([name, command]) => {
        console.log(`   ${name}: ${command}`);
      });
    }

    console.log('\n💬 Session Starters:');
    console.log('   "Continue with automation" - Run master automation');
    console.log('   "Check deployment status" - Monitor project deployments');
    console.log('   "Optimize project" - Add TanStack Query or other improvements');
    console.log('   "New feature" - Work on specific functionality');
    console.log('   "Review context" - See detailed session history');
    console.log('   "Start fresh" - Ignore previous context');

    console.log('\n📁 Context Files:');
    console.log(`   📝 Session: ${path.join(this.contextPath, 'SESSION_CONTEXT_COMPLETE.md')}`);
    console.log(`   ⚙️  Quick Ref: ${path.join(this.contextPath, 'QUICK_REFERENCE.md')}`);
    console.log(`   🔧  Automation: ${path.join(this.contextPath, 'master-automation.sh')}`);
  }

  // Save new session context
  saveNewSession(sessionType, summary) {
    const timestamp = new Date().toISOString();
    const update = {
      timestamp,
      sessionType,
      summary,
      previousContext: this.sessionContext ? 'loaded' : 'none'
    };

    const logFile = path.join(this.contextPath, 'session-history.json');
    let history = [];

    try {
      if (fs.existsSync(logFile)) {
        history = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      }
    } catch (error) {
      // Start fresh if corrupted
    }

    history.push(update);
    
    // Keep only last 10 sessions
    if (history.length > 10) {
      history = history.slice(-10);
    }

    try {
      fs.writeFileSync(logFile, JSON.stringify(history, null, 2));
      console.log('💾 Session logged');
    } catch (error) {
      console.log('⚠️  Could not save session log');
    }
  }
}

module.exports = OpenCodeAutoLoader;