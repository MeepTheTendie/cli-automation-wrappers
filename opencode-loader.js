#!/usr/bin/env node

/**
 * OpenCode Auto-Loader v2.0
 * Automatically loads user context and preferences on startup
 * Phase 1: Parallel Loading + Faster Startup
 * Phase 2: Schema Validation + Differential Updates
 * Phase 3: Lazy Context Loading + Compressed Storage
 * Phase 4: Context Deduplication + Modular Storage
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SCHEMA_VERSION = 3;
const DEFAULT_ESSENTIAL = {
  lastSession: 'Unknown',
  stack: 'Node.js + npm + Vite + TypeScript + TanStack',
  projects: [],
  sessionCount: 0
};

class OpenCodeAutoLoader {
  constructor() {
    this.contextPath = path.join(process.env.HOME, '.config', 'opencode');
    this.sessionContext = null;
    this.userPreferences = null;
    this.metadata = null;
    this._fullContext = null; // Lazy loaded
    this._contextLoaded = false;
  }

  async initialize(showFullDetails = false) {
    console.log('🚀 OpenCode - Initializing...\n');

    // Fast exit if no context files exist
    const hasContext = await this.checkForContextFiles();
    if (!hasContext) {
      console.log('ℹ️  No previous context found - starting fresh\n');
      this.sessionContext = this.createNewUserSession();
      console.log('✅ OpenCode ready!');
      return this.sessionContext;
    }

    // Load metadata and preferences in parallel (Phase 1 improvement)
    const [metadata, preferences] = await Promise.all([
      this.loadMetadata(),
      this.loadUserPreferences()
    ]);

    // Apply any pending deltas to metadata
    const metadataWithDeltas = await this.applyDeltasToMetadata(metadata);

    this.metadata = this.validateMetadata(metadataWithDeltas);
    this.userPreferences = preferences;

    // Lazy load full session context only when needed
    if (showFullDetails) {
      await this.loadSessionContext();
      this.displayContextSummary();
      this.suggestActions();
    } else {
      // Just show quick summary
      this.displayQuickSummary();
    }

    console.log('\n✅ OpenCode ready!');
    return this.metadata;
  }

  displayQuickSummary() {
    if (this.metadata?.essential) {
      console.log('📋 Quick Summary:');
      console.log(`   Last Session: ${this.metadata.essential.lastSession}`);
      console.log(`   Stack: ${this.metadata.essential.stack}`);
      console.log(`   Projects: ${this.metadata.essential.projects.join(', ')}`);
    }
  }

  async checkForContextFiles() {
    const files = [
      'SESSION_CONTEXT_COMPLETE.md',
      'context-metadata.json',
      'SESSION_CONTEXT_COMPLETE.json.gz',
      'QUICK_REFERENCE.md'
    ];

    const checks = files.map(f =>
      fs.promises.access(path.join(this.contextPath, f))
        .then(() => true)
        .catch(() => false)
    );

    const results = await Promise.all(checks);
    return results.some(Boolean);
  }

  async loadMetadata() {
    // Try compressed first (Phase 3 optimization)
    const compressedPath = path.join(this.contextPath, 'context-metadata.json.gz');
    const metadataPath = path.join(this.contextPath, 'context-metadata.json');

    try {
      // Try compressed file first
      if (fs.existsSync(compressedPath)) {
        const compressed = fs.readFileSync(compressedPath);
        const decompressed = zlib.gunzipSync(compressed);
        const metadata = JSON.parse(decompressed.toString('utf8'));
        console.log('📝 Loaded metadata (compressed)');
        return metadata;
      }

      // Fallback to plain JSON
      if (fs.existsSync(metadataPath)) {
        const content = fs.readFileSync(metadataPath, 'utf8');
        const metadata = JSON.parse(content);
        console.log('📝 Loaded metadata (fast path)');
        return metadata;
      }
    } catch (error) {
      // Continue to fallback
    }

    return null;
  }

  async saveMetadata(metadata) {
    const compressedPath = path.join(this.contextPath, 'context-metadata.json.gz');
    const metadataPath = path.join(this.contextPath, 'context-metadata.json');

    try {
      // Save compressed version
      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(metadata, null, 2)));
      fs.writeFileSync(compressedPath, compressed);
      
      // Also save plain JSON for backward compatibility
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      console.log('💾 Metadata saved (compressed + plain)');
    } catch (error) {
      console.log('⚠️  Could not save metadata:', error.message);
    }
  }

  async getFullContext() {
    if (this._contextLoaded && this._fullContext) {
      return this._fullContext;
    }

    await this.loadSessionContext();
    return this._fullContext;
  }

  compressContext() {
    console.log('📦 Compressing context files...\n');
    
    const metadataPath = path.join(this.contextPath, 'context-metadata.json');
    const sessionPath = path.join(this.contextPath, 'SESSION_CONTEXT_COMPLETE.md');

    // Compress metadata
    if (fs.existsSync(metadataPath)) {
      try {
        const content = fs.readFileSync(metadataPath, 'utf8');
        const compressed = zlib.gzipSync(Buffer.from(content));
        const compressedPath = path.join(this.contextPath, 'context-metadata.json.gz');
        fs.writeFileSync(compressedPath, compressed);
        
        const info = this.getSizeInfo(metadataPath, compressed);
        console.log(`✅ Metadata compressed: ${info.compressionRatio}% smaller`);
      } catch (error) {
        console.log('⚠️  Could not compress metadata:', error.message);
      }
    }

    // Compress session context
    if (fs.existsSync(sessionPath)) {
      try {
        const content = fs.readFileSync(sessionPath, 'utf8');
        const compressed = zlib.gzipSync(Buffer.from(content));
        const compressedPath = path.join(this.contextPath, 'SESSION_CONTEXT_COMPLETE.md.gz');
        fs.writeFileSync(compressedPath, compressed);
        
        const info = this.getSizeInfo(sessionPath, compressed);
        console.log(`✅ Session context compressed: ${info.compressionRatio}% smaller`);
      } catch (error) {
        console.log('⚠️  Could not compress session context:', error.message);
      }
    }
  }

  getSizeInfo(originalPath, compressedBuffer) {
    if (!fs.existsSync(originalPath)) return null;
    
    const originalBuffer = fs.readFileSync(originalPath);
    const originalBytes = originalBuffer.length;
    const compressedBytes = compressedBuffer.length;
    
    return {
      originalBytes,
      compressedBytes,
      compressionRatio: ((1 - compressedBytes / originalBytes) * 100).toFixed(1)
    };
  }

  validateMetadata(data) {
    if (!data) {
      console.log('⚠️  No metadata found, creating new');
      return this.createDefaultMetadata();
    }

    const errors = [];

    if (typeof data !== 'object') {
      errors.push('Metadata is not an object');
    }

    if (!data.version || typeof data.version !== 'number') {
      errors.push('Missing or invalid version');
    }

    if (!data.lastUpdated || typeof data.lastUpdated !== 'string') {
      errors.push('Missing or invalid lastUpdated');
    }

    if (!data.essential || typeof data.essential !== 'object') {
      errors.push('Missing or invalid essential section');
    } else {
      const e = data.essential;
      if (!e.lastSession || typeof e.lastSession !== 'string') {
        errors.push('Missing or invalid essential.lastSession');
      }
      if (!e.stack || typeof e.stack !== 'string') {
        errors.push('Missing or invalid essential.stack');
      }
      if (!Array.isArray(e.projects)) {
        errors.push('Missing or invalid essential.projects');
      }
    }

    if (errors.length > 0) {
      console.log('⚠️  Metadata validation failed:');
      errors.forEach(e => console.log(`   - ${e}`));
      console.log('🔧 Auto-repairing metadata...');
      return this.repairMetadata(data);
    }

    console.log('✅ Metadata validated successfully');
    return data;
  }

  repairMetadata(corruptedData) {
    const repaired = {
      version: SCHEMA_VERSION,
      lastUpdated: new Date().toISOString(),
      essential: { ...DEFAULT_ESSENTIAL }
    };

    // Preserve valid fields from corrupted data
    if (corruptedData && typeof corruptedData === 'object') {
      if (corruptedData.version) repaired.version = corruptedData.version;
      if (corruptedData.lastUpdated) repaired.lastUpdated = corruptedData.lastUpdated;
      
      if (corruptedData.essential && typeof corruptedData.essential === 'object') {
        if (corruptedData.essential.lastSession) {
          repaired.essential.lastSession = corruptedData.essential.lastSession;
        }
        if (corruptedData.essential.stack) {
          repaired.essential.stack = corruptedData.essential.stack;
        }
        if (Array.isArray(corruptedData.essential.projects)) {
          repaired.essential.projects = corruptedData.essential.projects;
        }
        if (typeof corruptedData.essential.sessionCount === 'number') {
          repaired.essential.sessionCount = corruptedData.essential.sessionCount;
        }
      }

      // Preserve session history if valid
      if (Array.isArray(corruptedData.sessionHistory)) {
        repaired.sessionHistory = corruptedData.sessionHistory.slice(-10);
      }
    }

    console.log('🔧 Metadata repaired');
    return repaired;
  }

  createDefaultMetadata() {
    return {
      version: SCHEMA_VERSION,
      lastUpdated: new Date().toISOString(),
      essential: { ...DEFAULT_ESSENTIAL }
    };
  }

  // Delta file system for incremental updates
  async saveDelta(operation, field, value) {
    const deltaPath = path.join(this.contextPath, 'context-deltas.jsonl');
    const delta = {
      timestamp: new Date().toISOString(),
      op: operation, // 'set', 'add', 'remove'
      field: field,
      value: value
    };

    try {
      fs.appendFileSync(deltaPath, JSON.stringify(delta) + '\n');
      console.log(`💾 Delta saved: ${operation} ${field}`);
      
      // Check if we should compact
      await this.checkAndCompactDeltas();
    } catch (error) {
      console.log('⚠️  Could not save delta:', error.message);
    }
  }

  async applyDeltasToMetadata(baseMetadata) {
    const deltaPath = path.join(this.contextPath, 'context-deltas.jsonl');
    
    if (!fs.existsSync(deltaPath)) {
      return baseMetadata;
    }

    try {
      const content = fs.readFileSync(deltaPath, 'utf8').trim();
      if (!content) return baseMetadata;
      
      const lines = content.split('\n');
      let result = baseMetadata ? JSON.parse(JSON.stringify(baseMetadata)) : null;
      
      if (!result) {
        result = this.createDefaultMetadata();
      }

      for (const line of lines) {
        const delta = JSON.parse(line);
        result = this.applySingleDelta(result, delta);
      }

      console.log(`📊 Applied ${lines.length} deltas`);
      return result;
    } catch (error) {
      console.log('⚠️  Error applying deltas:', error.message);
      return baseMetadata;
    }
  }

  applySingleDelta(base, delta) {
    if (!base || typeof base !== 'object') {
      base = this.createDefaultMetadata();
    }

    const path = delta.field.split('.');
    let target = base;

    // Navigate to parent
    for (let i = 1; i < path.length - 1; i++) {
      const key = path[i];
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }

    const lastKey = path[path.length - 1];

    switch (delta.op) {
      case 'set':
        target[lastKey] = delta.value;
        break;
      case 'add':
        if (Array.isArray(target[lastKey])) {
          target[lastKey].push(delta.value);
        } else if (typeof target[lastKey] === 'number') {
          target[lastKey] += delta.value;
        } else {
          target[lastKey] = delta.value;
        }
        break;
      case 'remove':
        delete target[lastKey];
        break;
    }

    return base;
  }

  async checkAndCompactDeltas() {
    const deltaPath = path.join(this.contextPath, 'context-deltas.jsonl');
    
    if (!fs.existsSync(deltaPath)) return;

    try {
      const content = fs.readFileSync(deltaPath, 'utf8').trim();
      if (!content) return;
      
      const lineCount = content.split('\n').length;
      
      // Compact if we have more than 50 deltas
      if (lineCount >= 50) {
        console.log('📦 Compacting deltas...');
        await this.compactDeltas();
      }
    } catch (error) {
      // Ignore errors
    }
  }

  async compactDeltas() {
    const deltaPath = path.join(this.contextPath, 'context-deltas.jsonl');
    const metadataPath = path.join(this.contextPath, 'context-metadata.json');
    
    try {
      // Load current metadata
      let metadata = this.createDefaultMetadata();
      if (fs.existsSync(metadataPath)) {
        const content = fs.readFileSync(metadataPath, 'utf8');
        metadata = JSON.parse(content);
      }

      // Apply all deltas
      metadata = await this.applyDeltasToMetadata(metadata);
      
      // Update timestamp and session count
      metadata.lastUpdated = new Date().toISOString();
      if (metadata.essential) {
        metadata.essential.sessionCount = (metadata.essential.sessionCount || 0) + 1;
      }

      // Save compacted metadata
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      // Remove delta file
      fs.unlinkSync(deltaPath);
      
      console.log('✅ Deltas compacted to base context');
    } catch (error) {
      console.log('⚠️  Error compacting deltas:', error.message);
    }
  }

  async updateMetadata(field, value) {
    // Save as delta
    await this.saveDelta('set', field, value);
    
    // Update in-memory metadata
    if (this.metadata && field.startsWith('essential.')) {
      const keys = field.split('.');
      let target = this.metadata.essential;
      for (let i = 1; i < keys.length - 1; i++) {
        target = target[keys[i]];
      }
      target[keys[keys.length - 1]] = value;
    }
  }

  async loadSessionContext() {
    const contextPaths = [
      path.join(this.contextPath, 'SESSION_CONTEXT_COMPLETE.md'),
      path.join(process.env.HOME, 'cli-automation-wrappers', 'SESSION_CONTEXT_COMPLETE.md')
    ];

    for (const contextFile of contextPaths) {
      try {
        if (fs.existsSync(contextFile)) {
          const content = fs.readFileSync(contextFile, 'utf8');
          this.sessionContext = this.parseMarkdownContext(content);
          
          // Extract metadata from markdown if needed
          if (!this.metadata) {
            this.metadata = this.extractMetadataFromMarkdown(content);
            this.metadata = this.validateMetadata(this.metadata);
          }
          
          console.log('📝 Loaded full session context');
          return;
        }
      } catch (error) {
        // Continue to next path
      }
    }

    console.log('ℹ️  No previous session context found');
    this.sessionContext = this.createNewUserSession();
    if (!this.metadata) {
      this.metadata = this.createDefaultMetadata();
    }
  }

  extractMetadataFromMarkdown(content) {
    const metadata = this.createDefaultMetadata();
    
    const stackMatch = content.match(/\*\*User Stack\*\*:\s*([^\n]+)/);
    if (stackMatch) {
      metadata.essential.stack = stackMatch[1].trim();
    }

    const projectsMatch = content.match(/\*\*User Projects\*\*:\s*([^\n]+)/);
    if (projectsMatch) {
      const projects = projectsMatch[1].split(',').map(p => p.trim());
      metadata.essential.projects = projects;
    }

    const dateMatch = content.match(/\*\*Session Date\*\*:\s*([^\n]+)/);
    if (dateMatch) {
      metadata.essential.lastSession = dateMatch[1].trim();
    }

    return metadata;
  }

  async loadUserPreferences() {
    const quickRefFile = path.join(this.contextPath, 'QUICK_REFERENCE.md');

    try {
      if (fs.existsSync(quickRefFile)) {
        const content = fs.readFileSync(quickRefFile, 'utf8');
        const preferences = this.parseQuickReference(content);
        console.log('⚙️  Loaded user preferences');
        return preferences;
      }
    } catch (error) {
      console.log('⚠️  Error loading preferences');
    }

    return null;
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
  async saveNewSession(sessionType, summary) {
    const timestamp = new Date().toISOString();
    
    // Update metadata using delta system
    await this.updateMetadata('essential.lastSession', new Date().toISOString().split('T')[0]);
    await this.updateMetadata('essential.sessionCount', (this.metadata?.essential?.sessionCount || 0) + 1);

    // Add to session history
    const historyEntry = {
      timestamp,
      sessionType,
      summary,
      previousContext: this.sessionContext ? 'loaded' : 'none'
    };

    await this.addToHistory(historyEntry);

    console.log('💾 Session saved with delta tracking');
  }

  async addToHistory(entry) {
    const historyPath = path.join(this.contextPath, 'session-history.json');
    
    let history = [];
    try {
      if (fs.existsSync(historyPath)) {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      }
    } catch {
      history = [];
    }

    history.push(entry);
    
    // Keep only last 10 sessions
    if (history.length > 10) {
      history = history.slice(-10);
    }

    try {
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
      await this.saveDelta('set', 'sessionHistory', history);
    } catch (error) {
      console.log('⚠️  Could not save session history');
    }
  }

  // CLI command handlers
  async handleCommand(args) {
    const command = args[0];

    switch (command) {
      case '--migrate':
        await this.migrateFromMarkdown();
        break;
      case '--compact':
        await this.compactDeltas();
        break;
      case '--validate':
        await this.validateContext();
        break;
      case '--repair':
        await this.repairContext();
        break;
      case '--status':
        await this.showStatus();
        break;
      case '--compress':
        this.compressContext();
        break;
      case '--decompress':
        await this.decompressContext();
        break;
      case '--dedupe':
        await this.deduplicateContext();
        break;
      case '--modularize':
        await this.modularizeContext();
        break;
      default:
        console.log('OpenCode Auto-Loader v2.0');
        console.log('');
        console.log('Usage: node opencode-loader.js [command]');
        console.log('');
        console.log('Commands:');
        console.log('  --migrate     Extract metadata from markdown context');
        console.log('  --compact     Compact deltas into base context');
        console.log('  --validate    Validate context schema');
        console.log('  --repair      Repair corrupted context');
        console.log('  --status      Show current context status');
        console.log('  --compress    Compress context files (Phase 3)');
        console.log('  --decompress  Decompress context files');
        console.log('  --dedupe      Extract unique facts to facts.json (Phase 4)');
        console.log('  --modularize  Split context into modular files');
    }
  }

  async migrateFromMarkdown() {
    console.log('📦 Migrating from markdown to metadata...\n');
    
    await this.loadSessionContext();
    
    if (this.metadata) {
      const metadataPath = path.join(this.contextPath, 'context-metadata.json');
      fs.writeFileSync(metadataPath, JSON.stringify(this.metadata, null, 2));
      console.log('✅ Metadata saved to context-metadata.json');
      console.log(`   Last session: ${this.metadata.essential.lastSession}`);
      console.log(`   Stack: ${this.metadata.essential.stack}`);
      console.log(`   Projects: ${this.metadata.essential.projects.join(', ')}`);
    }
  }

  async validateContext() {
    console.log('🔍 Validating context...\n');
    
    const metadataPath = path.join(this.contextPath, 'context-metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
      console.log('⚠️  No metadata file found');
      return;
    }

    try {
      const content = fs.readFileSync(metadataPath, 'utf8');
      const metadata = JSON.parse(content);
      const validated = this.validateMetadata(metadata);
      
      if (validated) {
        console.log('✅ Context is valid');
        console.log(`   Version: ${validated.version}`);
        console.log(`   Last updated: ${validated.lastUpdated}`);
        console.log(`   Sessions: ${validated.essential?.sessionCount || 0}`);
      }
    } catch (error) {
      console.log('❌ Context validation failed:', error.message);
    }
  }

  async repairContext() {
    console.log('🔧 Repairing context...\n');
    
    const metadataPath = path.join(this.contextPath, 'context-metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
      console.log('⚠️  No metadata file to repair');
      return;
    }

    try {
      const content = fs.readFileSync(metadataPath, 'utf8');
      const corrupted = JSON.parse(content);
      const repaired = this.repairMetadata(corrupted);
      
      fs.writeFileSync(metadataPath, JSON.stringify(repaired, null, 2));
      console.log('✅ Context repaired');
      console.log(`   Version: ${repaired.version}`);
      console.log(`   Last session: ${repaired.essential.lastSession}`);
    } catch (error) {
      console.log('❌ Could not repair context:', error.message);
    }
  }

  async showStatus() {
    console.log('📊 OpenCode Context Status\n');
    
    const metadataPath = path.join(this.contextPath, 'context-metadata.json');
    const deltaPath = path.join(this.contextPath, 'context-deltas.jsonl');
    
    let hasMetadata = fs.existsSync(metadataPath);
    let hasDeltas = fs.existsSync(deltaPath);
    
    console.log(`   Metadata: ${hasMetadata ? '✅' : '❌'}`);
    console.log(`   Deltas: ${hasDeltas ? '✅' : '❌'}`);
    
    if (hasMetadata) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        console.log(`   Version: ${metadata.version}`);
        console.log(`   Last session: ${metadata.essential?.lastSession || 'Unknown'}`);
        console.log(`   Session count: ${metadata.essential?.sessionCount || 0}`);
      } catch {
        console.log('   ⚠️  Could not read metadata');
      }
    }
    
      if (hasDeltas) {
      try {
        const content = fs.readFileSync(deltaPath, 'utf8').trim();
        const count = content ? content.split('\n').length : 0;
        console.log(`   Pending deltas: ${count}`);
      } catch {
        console.log('   ⚠️  Could not count deltas');
      }
    }
  }

  async decompressContext() {
    console.log('📦 Decompressing context files...\n');
    
    const compressedPath = path.join(this.contextPath, 'context-metadata.json.gz');
    const metadataPath = path.join(this.contextPath, 'context-metadata.json');

    // Decompress metadata
    if (fs.existsSync(compressedPath)) {
      try {
        const compressed = fs.readFileSync(compressedPath);
        const decompressed = zlib.gunzipSync(compressed);
        fs.writeFileSync(metadataPath, decompressed);
        console.log('✅ Metadata decompressed');
      } catch (error) {
        console.log('⚠️  Could not decompress metadata:', error.message);
      }
    }
  }

  async deduplicateContext() {
    console.log('🔄 Deduplicating context...\n');
    
    const sessionPath = path.join(this.contextPath, 'SESSION_CONTEXT_COMPLETE.md');
    const factsPath = path.join(this.contextPath, 'facts.json');

    if (!fs.existsSync(sessionPath)) {
      console.log('⚠️  No session context found');
      return;
    }

    const content = fs.readFileSync(sessionPath, 'utf8');
    
    // Extract unique facts
    const facts = {
      facts: {},
      version: SCHEMA_VERSION,
      lastUpdated: new Date().toISOString()
    };

    // Extract stack info
    const stackMatch = content.match(/\*\*User Stack\*\*:\s*([^\n]+)/);
    if (stackMatch) {
      const stackItems = stackMatch[1].split('+').map(s => s.trim());
      facts.facts['fact:stack-full'] = {
        id: 'fact:stack-full',
        category: 'tech-stack',
        content: stackItems,
        usedIn: ['metadata.essential.stack', 'session-context']
      };
    }

    // Extract projects
    const projectsMatch = content.match(/\*\*User Projects\*\*:\s*([^\n]+)/);
    if (projectsMatch) {
      const projects = projectsMatch[1].split(',').map(p => p.trim());
      facts.facts['fact:projects'] = {
        id: 'fact:projects',
        category: 'projects',
        content: projects,
        usedIn: ['metadata.essential.projects', 'session-context']
      };
    }

    fs.writeFileSync(factsPath, JSON.stringify(facts, null, 2));
    console.log('✅ Facts extracted to facts.json');
    console.log(`   Found ${Object.keys(facts.facts).length} unique facts`);
  }

  async modularizeContext() {
    console.log('📦 Modularizing context...\n');
    
    const contextDir = path.join(this.contextPath, 'context');
    await fs.promises.mkdir(contextDir, { recursive: true });

    // Load current metadata
    let metadata = this.createDefaultMetadata();
    const metadataPath = path.join(this.contextPath, 'context-metadata.json');
    
    if (fs.existsSync(metadataPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      } catch {
        console.log('⚠️  Could not load metadata');
      }
    }

    // Create modular files
    const modules = {
      '__init__.json': {
        version: metadata.version,
        schemaVersion: SCHEMA_VERSION,
        lastUpdated: metadata.lastUpdated
      },
      'base.json': {
        lastSession: metadata.essential?.lastSession,
        sessionCount: metadata.essential?.sessionCount
      },
      'stack.json': {
        stack: metadata.essential?.stack
      },
      'projects.json': {
        projects: metadata.essential?.projects
      },
      'history.json': {
        sessionHistory: metadata.sessionHistory || []
      }
    };

    for (const [filename, data] of Object.entries(modules)) {
      const modulePath = path.join(contextDir, filename);
      fs.writeFileSync(modulePath, JSON.stringify(data, null, 2));
    }

    console.log('✅ Context modularized');
    console.log(`   Created ${Object.keys(modules).length} module files`);
    console.log(`   Location: ${contextDir}`);
  }
}

module.exports = OpenCodeAutoLoader;

// CLI entry point
if (require.main === module) {
  const loader = new OpenCodeAutoLoader();
  const args = process.argv.slice(2);
  loader.handleCommand(args).catch(console.error);
}