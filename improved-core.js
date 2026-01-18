#!/usr/bin/env node

/**
 * Improved Automation Core
 * Addresses technical execution and code quality improvements
 */

const fs = require('fs');
const path = require('path');

class ImprovedAutomationCore {
  constructor() {
    this.workingDir = process.cwd();
    this.config = this.loadConfig();
    this.errors = [];
    this.warnings = [];
  }

  // IMPROVEMENT: Robust error handling and configuration management
  loadConfig() {
    const configPath = path.join(process.env.HOME, '.config', 'opencode', 'automation-config.json');
    const defaultConfig = {
      workingDir: process.env.HOME,
      logLevel: 'info',
      autoFix: true,
      testBeforeDeploy: true,
      skipProjects: ['.opencode', 'nerd-fonts', 'node_modules']
    };

    try {
      if (fs.existsSync(configPath)) {
        const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return { ...defaultConfig, ...userConfig };
      }
    } catch (error) {
      this.logWarning(`Config file error: ${error.message}. Using defaults.`);
    }

    // Create default config
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    } catch (error) {
      this.logError(`Failed to create config: ${error.message}`);
    }

    return defaultConfig;
  }

  // IMPROVEMENT: Consistent path management
  resolvePath(...paths) {
    return path.resolve(this.config.workingDir, ...paths);
  }

  ensureWorkingDir(targetDir) {
    try {
      if (!fs.existsSync(targetDir)) {
        throw new Error(`Directory does not exist: ${targetDir}`);
      }
      process.chdir(targetDir);
      this.workingDir = process.cwd();
      this.logInfo(`Changed working directory to: ${this.workingDir}`);
      return true;
    } catch (error) {
      this.logError(`Failed to change directory: ${error.message}`);
      return false;
    }
  }

  // IMPROVEMENT: Better logging system
  logInfo(message) {
    console.log(`ℹ️  ${message}`);
  }

  logWarning(message) {
    console.log(`⚠️  ${message}`);
    this.warnings.push(message);
  }

  logError(message) {
    console.error(`❌ ${message}`);
    this.errors.push(message);
  }

  logSuccess(message) {
    console.log(`✅ ${message}`);
  }

  // IMPROVEMENT: Type-safe project detection
  detectProjects() {
    try {
      const projects = new Map();
      const entries = fs.readdirSync(this.config.workingDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .filter(dirent => !this.config.skipProjects.includes(dirent.name))
        .map(dirent => dirent.name);

      for (const entry of entries) {
        const projectPath = this.resolvePath(entry);
        const project = this.analyzeProject(projectPath, entry);
        if (project) {
          projects.set(entry, project);
        }
      }

      this.logInfo(`Discovered ${projects.size} projects: ${Array.from(projects.keys()).join(', ')}`);
      return projects;
    } catch (error) {
      this.logError(`Project detection failed: ${error.message}`);
      return new Map();
    }
  }

  // IMPROVEMENT: Comprehensive project analysis with validation
  analyzeProject(projectPath, name) {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Validate required fields
      if (!packageJson.name || !packageJson.version) {
        this.logWarning(`Project ${name} has invalid package.json`);
        return null;
      }

      const project = {
        name,
        path: projectPath,
        packageJson,
        runtime: this.detectRuntime(projectPath),
        tanstack: this.detectTanStack(packageJson),
        backend: this.detectBackend(packageJson),
        hasTests: this.hasTests(projectPath),
        hasCI: this.hasCI(projectPath),
        errors: [],
        warnings: []
      };

      // Validate project health
      this.validateProject(project);
      return project;
    } catch (error) {
      this.logError(`Failed to analyze ${name}: ${error.message}`);
      return null;
    }
  }

  // IMPROVEMENT: More robust runtime detection
  detectRuntime(projectPath) {
    const runtimes = [
      { file: 'bun.lockb', runtime: 'bun' },
      { file: 'pnpm-lock.yaml', runtime: 'pnpm' },
      { file: 'yarn.lock', runtime: 'yarn' },
      { file: 'package-lock.json', runtime: 'npm' }
    ];

    for (const { file, runtime } of runtimes) {
      if (fs.existsSync(path.join(projectPath, file))) {
        return runtime;
      }
    }

    return 'npm'; // default
  }

  // IMPROVEMENT: Better TanStack detection with validation
  detectTanStack(packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    return {
      router: this.validateDependency(deps['@tanstack/react-router'], '@tanstack/react-router'),
      query: this.validateDependency(deps['@tanstack/react-query'], '@tanstack/react-query'),
      server: this.validateDependency(deps['@tanstack/start'], '@tanstack/start'),
      devtools: this.validateDependency(deps['@tanstack/react-devtools'], '@tanstack/react-devtools')
    };
  }

  // IMPROVEMENT: Backend detection with version checking
  detectBackend(packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    return {
      supabase: this.validateDependency(deps['@supabase/supabase-js'], '@supabase/supabase-js'),
      convex: this.validateDependency(deps['convex'], 'convex'),
      vercel: this.validateDependency(deps['@vercel/node'], '@vercel/node'),
      render: this.validateDependency(deps['@render/server'], '@render/server')
    };
  }

  // IMPROVEMENT: Dependency validation
  validateDependency(version, name) {
    if (!version) return { installed: false, version: null, name };
    
    // Basic semver validation
    const semverRegex = /^\d+\.\d+\.\d+/;
    const isValidVersion = semverRegex.test(version.replace(/[^0-9.]/g, ''));
    
    return {
      installed: true,
      version,
      name,
      isValidVersion,
      outdated: false // Will be checked later
    };
  }

  // IMPROVEMENT: Project health validation
  hasTests(projectPath) {
    const testFiles = [
      'jest.config.js', 'jest.config.ts', 'vitest.config.js', 'vitest.config.ts',
      'test', 'tests', '__tests__', 'src/__tests__'
    ];

    return testFiles.some(file => {
      const filePath = path.join(projectPath, file);
      return fs.existsSync(filePath) || fs.existsSync(filePath + '.js') || fs.existsSync(filePath + '.ts');
    });
  }

  hasCI(projectPath) {
    const ciFiles = [
      '.github/workflows/ci.yml',
      '.github/workflows/ci.yaml',
      '.github/workflows/cd.yml',
      '.github/workflows/cd.yaml'
    ];

    return ciFiles.some(file => fs.existsSync(path.join(projectPath, file)));
  }

  // IMPROVEMENT: Comprehensive project validation
  validateProject(project) {
    // Check for missing essentials
    if (!project.hasTests) {
      project.warnings.push('No test framework detected');
    }

    if (!project.hasCI) {
      project.warnings.push('No CI/CD workflow detected');
    }

    // Check for common issues
    if (project.tanstack.router && !project.tanstack.query) {
      project.warnings.push('TanStack Router detected but no Query - missing caching');
    }

    if (project.backend.supabase && !project.tanstack.query) {
      project.warnings.push('Supabase backend without TanStack Query - suboptimal');
    }

    if (project.runtime === 'npm' && project.packageJson.scripts?.install) {
      project.warnings.push('Custom install script with npm - consider using lockfile');
    }
  }

  // IMPROVEMENT: Execution validation
  async validateStep(stepName, validationFn) {
    try {
      this.logInfo(`Validating: ${stepName}`);
      const result = await validationFn();
      
      if (result.success) {
        this.logSuccess(`${stepName} passed`);
        return true;
      } else {
        this.logError(`${stepName} failed: ${result.error}`);
        return false;
      }
    } catch (error) {
      this.logError(`${stepName} error: ${error.message}`);
      return false;
    }
  }

  // IMPROVEMENT: Summary reporting
  generateSummary(results) {
    const summary = {
      total: results.size,
      successful: 0,
      failed: 0,
      warnings: this.warnings.length,
      errors: this.errors.length,
      projects: []
    };

    for (const [name, result] of results) {
      if (result.success) {
        summary.successful++;
      } else {
        summary.failed++;
      }

      summary.projects.push({
        name,
        success: result.success,
        runtime: result.project?.runtime,
        tanstack: result.project?.tanstack,
        backend: result.project?.backend
      });
    }

    return summary;
  }

  // IMPROVEMENT: Cleanup and error recovery
  cleanup() {
    // Reset working directory
    process.chdir(this.config.workingDir);
    
    // Report any accumulated errors/warnings
    if (this.errors.length > 0) {
      this.logError(`Total errors: ${this.errors.length}`);
    }
    
    if (this.warnings.length > 0) {
      this.logWarning(`Total warnings: ${this.warnings.length}`);
    }
  }
}

module.exports = ImprovedAutomationCore;