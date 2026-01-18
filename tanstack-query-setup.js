#!/usr/bin/env node

/**
 * TanStack Query Auto-Setup
 * Automatically configures TanStack Query for projects using Supabase/Convex
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TanStackQuerySetup {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.packageJsonPath = path.join(projectPath, 'package.json');
    this.packageJson = this.loadPackageJson();
  }

  loadPackageJson() {
    try {
      return JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
    } catch (error) {
      console.error('❌ Error reading package.json:', error.message);
      return null;
    }
  }

  detectBackend() {
    const deps = { ...this.packageJson.dependencies, ...this.packageJson.devDependencies };
    
    if (deps['@supabase/supabase-js']) return 'supabase';
    if (deps['convex']) return 'convex';
    return 'none';
  }

  hasTanStackQuery() {
    const deps = { ...this.packageJson.dependencies, ...this.packageJson.devDependencies };
    return !!deps['@tanstack/react-query'];
  }

  setupTanStackQuery() {
    if (this.hasTanStackQuery()) {
      console.log('✅ TanStack Query already installed');
      return false;
    }

    const backend = this.detectBackend();
    if (backend === 'none') {
      console.log('ℹ️  No supported backend detected (Supabase/Convex)');
      return false;
    }

    console.log(`🚀 Setting up TanStack Query for ${backend}...`);

    // Add TanStack Query to dependencies
    if (!this.packageJson.dependencies) {
      this.packageJson.dependencies = {};
    }
    this.packageJson.dependencies['@tanstack/react-query'] = '^5.0.0';

    // Save package.json
    fs.writeFileSync(this.packageJsonPath, JSON.stringify(this.packageJson, null, 2));
    console.log('✅ Added @tanstack/react-query to dependencies');

    // Create query configuration
    this.createQueryConfig(backend);
    
    // Create custom hooks
    this.createCustomHooks(backend);
    
    // Update main app file
    this.updateMainApp();

    console.log('✅ TanStack Query setup complete!');
    return true;
  }

  createQueryConfig(backend) {
    const configPath = path.join(this.projectPath, 'src', 'lib', 'query-client.ts');
    const libDir = path.dirname(configPath);

    if (!fs.existsSync(libDir)) {
      fs.mkdirSync(libDir, { recursive: true });
    }

    let configContent = '';

    if (backend === 'supabase') {
      configContent = `import { createClient } from './supabase'
import { createQueryClient } from '@tanstack/react-query'

export const queryClient = createQueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error?.status >= 400 && error?.status < 500) return false
        return failureCount < 3
      }
    }
  }
})

export const supabase = createClient()
`;
    } else if (backend === 'convex') {
      configContent = `import { convexQuery } from '@tanstack/react-query-convex'
import { queryClient } from './convex'

export const queryClient = queryClient

// Convex Query integration
export { convexQuery }
`;
    }

    fs.writeFileSync(configPath, configContent);
    console.log('✅ Created query client configuration');
  }

  createCustomHooks(backend) {
    const hooksPath = path.join(this.projectPath, 'src', 'hooks', 'useQueries.ts');
    const hooksDir = path.dirname(hooksPath);

    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    let hooksContent = '';

    if (backend === 'supabase') {
      hooksContent = `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/query-client'

// Generic Supabase query hook
export function useSupabaseQuery<T>(
  key: string[],
  queryFn: () => Promise<{ data: T | null; error: any }>,
  options?: any
) {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await queryFn()
      if (error) throw error
      return data
    },
    ...options
  })
}

// Generic Supabase mutation hook
export function useSupabaseMutation<T>(
  mutationFn: (variables: T) => Promise<{ data: any; error: any }>,
  invalidateQueries?: string[][]
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variables: T) => {
      const { data, error } = await mutationFn(variables)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      if (invalidateQueries) {
        invalidateQueries.forEach(keys => {
          queryClient.invalidateQueries({ queryKey: keys })
        })
      }
    }
  })
}

// Example workout hooks for iron-tracker
export function useWorkouts() {
  return useSupabaseQuery(
    ['workouts'],
    () => supabase.from('workouts').select('*')
  )
}

export function useCreateWorkout() {
  return useSupabaseMutation(
    (workout: any) => supabase.from('workouts').insert(workout),
    [['workouts']]
  )
}
`;
    } else if (backend === 'convex') {
      hooksContent = `import { useQuery, useMutation } from '@tanstack/react-query'
import { convexQuery, api } from '../lib/convex'

// Generic Convex query hook
export function useConvexQuery<TResult, TArgs>(
  queryName: string,
  args?: TArgs
) {
  return convexQuery({
    query: api[queryName].query,
    args
  })
}

// Generic Convex mutation hook
export function useConvexMutation<TResult, TArgs>(
  mutationName: string,
  invalidateQueries?: string[][]
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (args: TArgs) => api[mutationName].mutation(args),
    onSuccess: () => {
      if (invalidateQueries) {
        invalidateQueries.forEach(keys => {
          queryClient.invalidateQueries({ queryKey: keys })
        })
      }
    }
  })
}

// Example shows hooks for toku-tracker
export function useShows() {
  return useConvexQuery('shows.list')
}

export function useAddShow() {
  return useConvexMutation('shows.create', [['shows']])
}
`;
    }

    fs.writeFileSync(hooksPath, hooksContent);
    console.log('✅ Created custom hooks');
  }

  updateMainApp() {
    const mainPath = path.join(this.projectPath, 'src', 'main.tsx');
    
    if (!fs.existsSync(mainPath)) {
      console.log('⚠️  main.tsx not found, skipping app integration');
      return;
    }

    let content = fs.readFileSync(mainPath, 'utf8');

    // Add QueryClientProvider if not present
    if (!content.includes('QueryClientProvider')) {
      content = content.replace(
        'import React from \'react\'',
        'import React from \'react\'\nimport { QueryClientProvider } from \'@tanstack/react-query\'\nimport { queryClient } from \'./lib/query-client\''
      );

      content = content.replace(
        /React\.createElement\(([^,]+),[^,]*,([^)]+)\)/,
        'React.createElement(QueryClientProvider, { client: queryClient }, React.createElement($1, null, $2))'
      );

      fs.writeFileSync(mainPath, content);
      console.log('✅ Updated main.tsx with QueryClientProvider');
    }
  }

  async installDependencies() {
    console.log('📦 Installing dependencies...');
    
    const runtime = this.detectRuntime();
    let command = '';
    
    switch (runtime) {
      case 'bun':
        command = 'bun install';
        break;
      case 'pnpm':
        command = 'pnpm install';
        break;
      case 'yarn':
        command = 'yarn install';
        break;
      default:
        command = 'npm install';
    }

    try {
      process.chdir(this.projectPath);
      execSync(command, { stdio: 'inherit' });
      console.log('✅ Dependencies installed successfully');
    } catch (error) {
      console.error('❌ Error installing dependencies:', error.message);
    }
  }

  detectRuntime() {
    if (fs.existsSync(path.join(this.projectPath, 'bun.lockb'))) return 'bun';
    if (fs.existsSync(path.join(this.projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(this.projectPath, 'yarn.lock'))) return 'yarn';
    return 'npm';
  }

  async run() {
    console.log(`🚀 Setting up TanStack Query for ${path.basename(this.projectPath)}...`);
    
    if (!this.packageJson) {
      return false;
    }

    const setupSuccess = this.setupTanStackQuery();
    if (!setupSuccess) {
      return false;
    }

    await this.installDependencies();
    return true;
  }
}

// CLI Interface
async function main() {
  const projectPath = process.argv[2];
  
  if (!projectPath) {
    console.log('Usage: node tanstack-query-setup.js <project-path>');
    process.exit(1);
  }

  const setup = new TanStackQuerySetup(projectPath);
  await setup.run();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = TanStackQuerySetup;