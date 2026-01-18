#!/usr/bin/env node

/**
 * Deployment Integration System
 * Automates deployment monitoring and error handling across Vercel, Render, and Supabase
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DeploymentManager {
  constructor() {
    this.projects = this.discoverProjects();
    this.credentials = this.loadCredentials();
  }

  loadCredentials() {
    const credPath = path.join(process.env.HOME, '.config', 'opencode', 'credentials.json');
    if (fs.existsSync(credPath)) {
      return JSON.parse(fs.readFileSync(credPath, 'utf8'));
    }
    return {};
  }

  async checkDeploymentStatus(projectName) {
    const project = this.projects[projectName];
    if (!project) throw new Error(`Project ${projectName} not found`);

    console.log(`🔍 Checking deployment status for ${projectName}...`);

    // Skip non-web projects
    if (projectName.startsWith('.') || projectName === 'nerd-fonts') {
      return { status: 'skipped', message: 'Non-web project' };
    }

    try {
      switch (project.platform) {
        case 'vercel':
          return await this.checkVercelDeployment(project, projectName);
        case 'render':
          return await this.checkRenderDeployment(project, projectName);
        default:
          throw new Error(`Unsupported platform: ${project.platform}`);
      }
    } catch (error) {
      console.error(`❌ Error checking ${projectName}:`, error.message);
      return { status: 'error', error: error.message };
    }
  }

  async checkVercelDeployment(project, projectName) {
    const token = this.credentials.vercel_token;
    if (!token) {
      return { status: 'no_credentials', message: 'Vercel token not configured' };
    }

    // Get project info from hardcoded IDs
    const projectId = await this.extractProjectId(projectName);
    if (!projectId) {
      return { status: 'no_project_id', message: 'Vercel project ID not found' };
    }

    try {
      const response = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const latestDeployment = data.deployments[0];

      if (!latestDeployment) {
        return { status: 'no_deployments', message: 'No deployments found' };
      }

      return {
        status: latestDeployment.state === 'READY' ? 'success' : 'failed',
        deployment: {
          id: latestDeployment.id,
          url: latestDeployment.url,
          state: latestDeployment.state,
          createdAt: latestDeployment.created,
          readyState: latestDeployment.readyState
        }
      };
    } catch (error) {
      return { status: 'api_error', error: error.message };
    }
  }

  async checkRenderDeployment(project, projectName) {
    const token = this.credentials.render_token;
    if (!token) {
      return { status: 'no_credentials', message: 'Render token not configured' };
    }

    try {
      const response = await fetch('https://api.render.com/v1/services', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const services = await response.json();
      const service = services.find(s => s.name === projectName);
      
      if (!service) {
        return { status: 'service_not_found', message: `Service ${project.name} not found` };
      }

      return {
        status: service.status === 'live' ? 'success' : 'failed',
        service: {
          id: service.id,
          name: service.name,
          status: service.status,
          url: service.serviceDetails.url
        }
      };
    } catch (error) {
      return { status: 'api_error', error: error.message };
    }
  }

  discoverProjects() {
    const projects = {};
    const homeDir = process.env.HOME;
    
    // Find all directories in home that look like projects
    try {
      const dirs = fs.readdirSync(homeDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      
      for (const dir of dirs) {
        const projectPath = path.join(homeDir, dir);
        const packageJsonPath = path.join(projectPath, 'package.json');
        
        // Check if it's a Node.js project
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          const ciFile = path.join(projectPath, '.github', 'workflows', 'ci.yml');
          const hasWorkflows = fs.existsSync(ciFile) || 
                             fs.existsSync(path.join(projectPath, '.github', 'workflows'));
          
          // Detect TanStack usage
          const hasTanStackRouter = packageJson.dependencies?.['@tanstack/react-router'] || 
                                 packageJson.devDependencies?.['@tanstack/react-router'];
          const hasTanStackQuery = packageJson.dependencies?.['@tanstack/react-query'] || 
                                packageJson.devDependencies?.['@tanstack/react-query'];
          const hasTanStackServer = packageJson.dependencies?.['@tanstack/start'] || 
                                  packageJson.devDependencies?.['@tanstack/start'];
          
          // Detect backend (Supabase/Convex)
          const hasSupabase = packageJson.dependencies?.['@supabase/supabase-js'] || 
                           packageJson.devDependencies?.['@supabase/supabase-js'];
          const hasConvex = packageJson.dependencies?.['convex'] || 
                         packageJson.devDependencies?.['convex'];
          
          // Detect runtime
          const runtime = this.detectRuntime(projectPath);
          
          projects[dir] = {
            path: projectPath,
            platform: 'vercel',
            ciFile: hasWorkflows ? ciFile : null,
            discovered: true,
            tanstack: {
              router: !!hasTanStackRouter,
              query: !!hasTanStackQuery,
              server: !!hasTanStackServer
            },
            backend: {
              supabase: !!hasSupabase,
              convex: !!hasConvex
            },
            runtime,
            packageJson
          };
        }
      }
      
      console.log(`🔍 Discovered ${Object.keys(projects).length} projects: ${Object.keys(projects).join(', ')}`);
      return projects;
    } catch (error) {
      console.error('Error discovering projects:', error.message);
      return {};
    }
  }

  detectRuntime(projectPath) {
    if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) return 'bun';
    if (fs.existsSync(path.join(projectPath, 'deno.jsonc')) || fs.existsSync(path.join(projectPath, 'deno.json'))) return 'deno';
    if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) return 'npm';
    return 'npm'; // default
  }

  async getVercelProjectId(projectName) {
    const token = this.credentials.vercel_token;
    if (!token) return null;
    
    try {
      const response = await fetch('https://api.vercel.com/v9/projects', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) return null;
      
      const data = await response.json();
      const project = data.projects?.find(p => p.name === projectName);
      return project?.id || null;
    } catch (error) {
      console.error(`Error fetching Vercel project ID for ${projectName}:`, error.message);
      return null;
    }
  }

  async extractProjectId(projectName) {
    // First try to get from Vercel API (dynamic)
    const vercelId = await this.getVercelProjectId(projectName);
    if (vercelId) {
      return vercelId;
    }
    
    // Fallback to hardcoded IDs for existing projects
    const fallbackIds = {
      'iron-tracker': 'prj_N6TsygtXBFHmvOKU5X4MJRyPCxtM',
      'toku-tracker': 'prj_qdCLIGkFCaFpwe2QuvRSzsAB6lKB'
    };
    return fallbackIds[projectName] || null;
  }

  async getDeploymentLogs(projectName, deploymentId) {
    console.log(`📋 Fetching deployment logs for ${projectName}...`);
    
    const project = this.projects[projectName];
    const token = this.credentials.vercel_token;
    
    if (!token) {
      return { error: 'Vercel token not configured' };
    }

    try {
      const response = await fetch(`https://api.vercel.com/v2/deployments/${deploymentId}/logs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const logs = await response.text();
      return { logs };
    } catch (error) {
      return { error: error.message };
    }
  }

  async monitorAllProjects() {
    console.log('🚀 Starting deployment monitoring for all projects...\n');
    
    const results = {};
    
    for (const [projectName, project] of Object.entries(this.projects)) {
      results[projectName] = await this.checkDeploymentStatus(projectName);
      
      console.log(`\n--- ${projectName.toUpperCase()} ---`);
      console.log(JSON.stringify(results[projectName], null, 2));
      
      // Show tech stack details
      if (project.discovered) {
        console.log(`📊 Tech Stack:`);
        console.log(`   Runtime: ${project.runtime}`);
        console.log(`   TanStack: ${JSON.stringify(project.tanstack)}`);
        console.log(`   Backend: ${JSON.stringify(project.backend)}`);
        
        // Suggest improvements
        this.suggestOptimizations(projectName, project);
      }
    }
    
    return results;
  }

  suggestOptimizations(projectName, project) {
    const suggestions = [];
    
    // TanStack Query suggestions
    if (project.tanstack.router && !project.tanstack.query) {
      if (project.backend.supabase) {
        suggestions.push("🚀 Add TanStack Query for Supabase caching");
      } else if (project.backend.convex) {
        suggestions.push("🚀 Add TanStack Query for Convex optimistic updates");
      }
    }
    
    // TanStack Server suggestions
    if (project.tanstack.router && !project.tanstack.server) {
      suggestions.push("🔥 Consider TanStack Start for full-stack");
    }
    
    // Runtime suggestions
    if (project.runtime === 'npm' && fs.existsSync('/usr/bin/bun')) {
      suggestions.push("⚡ Try Bun for faster installs");
    }
    
    if (suggestions.length > 0) {
      console.log(`💡 Suggested optimizations:`);
      suggestions.forEach(s => console.log(`   ${s}`));
    }
  }

  setupCredentials() {
    console.log('🔐 Setting up deployment credentials...');
    console.log('\nTo get your tokens:');
    console.log('1. Vercel: https://vercel.com/account/tokens');
    console.log('2. Render: https://dashboard.render.com/u/settings?add-api-key');
    console.log('3. Supabase: https://supabase.com/account/tokens\n');
    
    const credentials = {
      vercel_token: process.env.VERCEL_TOKEN || 'your_vercel_token_here',
      render_token: process.env.RENDER_TOKEN || 'your_render_token_here',
      supabase_token: process.env.SUPABASE_TOKEN || 'your_supabase_token_here'
    };
    
    const credDir = path.join(process.env.HOME, '.config', 'opencode');
    if (!fs.existsSync(credDir)) {
      fs.mkdirSync(credDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(credDir, 'credentials.json'),
      JSON.stringify(credentials, null, 2)
    );
    
    console.log('✅ Credentials template created at ~/.config/opencode/credentials.json');
    console.log('📝 Please edit this file with your actual tokens');
  }

  async runLocalTests(projectName) {
    const project = this.projects[projectName];
    if (!project) throw new Error(`Project ${projectName} not found`);

    console.log(`🧪 Running local tests for ${projectName}...`);
    
    try {
      process.chdir(project.path);
      
      // Run the established test sequence
      console.log('  📝 Running npm run check...');
      execSync('npm run check', { stdio: 'inherit' });
      
      console.log('  🏗️  Running npm run build...');
      execSync('npm run build', { stdio: 'inherit' });
      
      console.log('  🧪 Running npm run test...');
      execSync('npm run test', { stdio: 'inherit' });
      
      return { status: 'success', message: 'All tests passed' };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }
}

// CLI Interface
async function main() {
  const manager = new DeploymentManager();
  const command = process.argv[2];
  const projectName = process.argv[3];

  switch (command) {
    case 'setup':
      manager.setupCredentials();
      break;
      
    case 'check':
      if (!projectName) {
        console.log('Checking all projects...');
        await manager.monitorAllProjects();
      } else {
        const status = await manager.checkDeploymentStatus(projectName);
        console.log(JSON.stringify(status, null, 2));
      }
      break;
      
    case 'logs':
      if (!projectName) {
        console.error('Project name required for logs');
        process.exit(1);
      }
      const deploymentId = process.argv[4];
      if (!deploymentId) {
        console.error('Deployment ID required for logs');
        process.exit(1);
      }
      const logs = await manager.getDeploymentLogs(projectName, deploymentId);
      console.log(logs.logs || logs.error);
      break;
      
    case 'test':
      if (!projectName) {
        console.error('Project name required for testing');
        process.exit(1);
      }
      const testResult = await manager.runLocalTests(projectName);
      console.log(JSON.stringify(testResult, null, 2));
      break;
      
    case 'monitor':
      await manager.monitorAllProjects();
      break;
      
    default:
      console.log(`
🚀 Deployment Manager

Usage:
  node deployment.js setup                    # Setup credentials
  node deployment.js check [project]          # Check deployment status
  node deployment.js logs <project> <id>      # Get deployment logs
  node deployment.js test <project>           # Run local tests
  node deployment.js monitor                  # Monitor all projects

Examples:
  node deployment.js check iron-tracker
  node deployment.js test toku-tracker
  node deployment.js monitor
      `);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DeploymentManager;