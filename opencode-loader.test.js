const fs = require('fs');
const path = require('path');
const { OpenCodeAutoLoader } = require('./opencode-loader');

// Test utilities
const testContextPath = path.join(__dirname, 'test-context');
const testMetadataPath = path.join(testContextPath, 'context-metadata.json');
const testDeltasPath = path.join(testContextPath, 'context-deltas.jsonl');

beforeAll(async () => {
  // Create test directory
  await fs.promises.mkdir(testContextPath, { recursive: true });
});

afterAll(async () => {
  // Cleanup test directory
  if (fs.existsSync(testContextPath)) {
    const files = await fs.promises.readdir(testContextPath);
    for (const file of files) {
      await fs.promises.unlink(path.join(testContextPath, file));
    }
    await fs.promises.rmdir(testContextPath);
  }
});

beforeEach(() => {
  // Clean up test files before each test
  if (fs.existsSync(testMetadataPath)) fs.unlinkSync(testMetadataPath);
  if (fs.existsSync(testDeltasPath)) fs.unlinkSync(testDeltasPath);
});

describe('OpenCodeAutoLoader', () => {
  describe('Schema Validation', () => {
    it('should validate correct metadata', () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      const validMetadata = {
        version: 3,
        lastUpdated: new Date().toISOString(),
        essential: {
          lastSession: '2026-01-17',
          stack: 'Node.js + npm',
          projects: ['iron-tracker'],
          sessionCount: 5
        }
      };

      const result = loader.validateMetadata(validMetadata);
      expect(result).toBeDefined();
      expect(result.version).toBe(3);
      expect(result.essential.lastSession).toBe('2026-01-17');
    });

    it('should repair corrupted metadata', () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      const corruptedMetadata = {
        version: 'invalid',
        lastUpdated: null,
        essential: {
          lastSession: '2026-01-17',
          // missing stack and projects
        }
      };

      const result = loader.validateMetadata(corruptedMetadata);
      expect(result).toBeDefined();
      expect(result.version).toBe(3);
      expect(result.essential.stack).toBe('Node.js + npm + Vite + TypeScript + TanStack');
      expect(Array.isArray(result.essential.projects)).toBe(true);
    });

    it('should create default metadata when null', () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      const result = loader.validateMetadata(null);
      expect(result).toBeDefined();
      expect(result.version).toBe(3);
      expect(result.essential.lastSession).toBe('Unknown');
    });
  });

  describe('Delta System', () => {
    it('should save and apply set delta', async () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      await loader.saveDelta('set', 'essential.lastSession', '2026-01-18');

      expect(fs.existsSync(testDeltasPath)).toBe(true);
      const content = fs.readFileSync(testDeltasPath, 'utf8').trim();
      expect(content).toContain('"op":"set"');
      expect(content).toContain('"field":"essential.lastSession"');
    });

    it('should apply single delta correctly', () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      const base = { essential: { lastSession: 'old', stack: 'test' } };
      const delta = { op: 'set', field: 'essential.lastSession', value: 'new' };

      const result = loader.applySingleDelta(base, delta);
      expect(result.essential.lastSession).toBe('new');
      expect(result.essential.stack).toBe('test');
    });

    it('should apply add delta to arrays', () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      const base = { essential: { projects: ['iron-tracker'] } };
      const delta = { op: 'add', field: 'essential.projects', value: 'toku-tracker' };

      const result = loader.applySingleDelta(base, delta);
      expect(result.essential.projects).toContain('iron-tracker');
      expect(result.essential.projects).toContain('toku-tracker');
    });

    it('should apply deltas to metadata', async () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      const base = {
        version: 3,
        lastUpdated: new Date().toISOString(),
        essential: {
          lastSession: 'old',
          stack: 'test',
          projects: [],
          sessionCount: 0
        }
      };

      // Save some deltas
      await loader.saveDelta('set', 'essential.lastSession', '2026-01-18');
      await loader.saveDelta('set', 'essential.stack', 'Node.js + npm + Vite');

      // Apply deltas
      const result = await loader.applyDeltasToMetadata(base);
      expect(result.essential.lastSession).toBe('2026-01-18');
      expect(result.essential.stack).toBe('Node.js + npm + Vite');
    });
  });

  describe('Metadata Operations', () => {
    it('should create default metadata', () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      const result = loader.createDefaultMetadata();
      expect(result.version).toBe(3);
      expect(result.essential.lastSession).toBe('Unknown');
      expect(result.essential.stack).toBe('Node.js + npm + Vite + TypeScript + TanStack');
      expect(result.essential.projects).toEqual([]);
    });

    it('should repair metadata preserving valid fields', () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      const corrupted = {
        version: 2,
        lastUpdated: '2026-01-15T10:00:00Z',
        essential: {
          lastSession: '2026-01-15',
          stack: 'Custom Stack',
          projects: ['custom-project'],
          sessionCount: 10
        }
      };

      const result = loader.repairMetadata(corrupted);
      expect(result.version).toBe(3); // Updated
      expect(result.essential.lastSession).toBe('2026-01-15'); // Preserved
      expect(result.essential.stack).toBe('Custom Stack'); // Preserved
      expect(result.essential.projects).toEqual(['custom-project']); // Preserved
    });
  });

  describe('Markdown Extraction', () => {
    it('should extract metadata from markdown', () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      const markdown = `
# Complete Session Context

**Session Date**: 2026-01-17
**User Stack**: Node.js + npm + Vite + TypeScript
**User Projects**: iron-tracker, toku-tracker

## More Content
...
`;

      const result = loader.extractMetadataFromMarkdown(markdown);
      expect(result.essential.lastSession).toBe('2026-01-17');
      expect(result.essential.stack).toContain('Node.js');
      expect(result.essential.projects).toContain('iron-tracker');
      expect(result.essential.projects).toContain('toku-tracker');
    });
  });

  describe('CLI Commands', () => {
    it('should show help', async () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      const logs = [];
      console.log = (...args) => logs.push(args.join(' '));

      await loader.handleCommand([]);

      expect(logs.some(l => l.includes('Usage:'))).toBe(true);
      expect(logs.some(l => l.includes('--migrate'))).toBe(true);
      expect(logs.some(l => l.includes('--compress'))).toBe(true);
      expect(logs.some(l => l.includes('--dedupe'))).toBe(true);
      expect(logs.some(l => l.includes('--modularize'))).toBe(true);
    });

    it('should show status', async () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      // Create a metadata file
      fs.writeFileSync(testMetadataPath, JSON.stringify({
        version: 3,
        essential: {
          lastSession: '2026-01-17',
          sessionCount: 5
        }
      }));

      const logs = [];
      console.log = (...args) => logs.push(args.join(' '));

      await loader.handleCommand(['--status']);

      expect(logs.some(l => l.includes('✅'))).toBe(true);
    });

    it('should validate context', async () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      // Create valid metadata
      fs.writeFileSync(testMetadataPath, JSON.stringify({
        version: 3,
        lastUpdated: new Date().toISOString(),
        essential: {
          lastSession: '2026-01-17',
          stack: 'Node.js',
          projects: [],
          sessionCount: 0
        }
      }));

      const logs = [];
      console.log = (...args) => logs.push(args.join(' '));

      await loader.handleCommand(['--validate']);

      expect(logs.some(l => l.includes('✅ Context is valid'))).toBe(true);
    });

    it('should repair corrupted context', async () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      // Create corrupted metadata
      fs.writeFileSync(testMetadataPath, JSON.stringify({
        version: 'invalid',
        essential: {}
      }));

      const logs = [];
      console.log = (...args) => logs.push(args.join(' '));

      await loader.handleCommand(['--repair']);

      expect(logs.some(l => l.includes('✅ Context repaired'))).toBe(true);
      
      // Verify repaired
      const repaired = JSON.parse(fs.readFileSync(testMetadataPath, 'utf8'));
      expect(repaired.version).toBe(3);
    });
  });

  describe('Compression', () => {
    it('should compress and decompress context', () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;

      const original = {
        version: 3,
        essential: {
          lastSession: '2026-01-17',
          stack: 'Node.js + npm + Vite + TypeScript + TanStack + React',
          projects: ['iron-tracker', 'toku-tracker', 'project-3', 'project-4', 'project-5'],
          sessionCount: 10
        }
      };

      // Test compression via zlib
      const compressed = Buffer.from(JSON.stringify(original));
      const gzipped = zlib.gzipSync(compressed);
      const decompressed = zlib.gunzipSync(gzipped);
      const result = JSON.parse(decompressed.toString('utf8'));

      expect(result.version).toBe(original.version);
      expect(result.essential.lastSession).toBe(original.essential.lastSession);
      expect(result.essential.projects).toEqual(original.essential.projects);
    });
  });

  describe('Session History', () => {
    it('should add to history', async () => {
      const loader = new OpenCodeAutoLoader();
      loader.contextPath = testContextPath;
      loader.metadata = {
        essential: { sessionCount: 0 }
      };

      await loader.addToHistory({
        timestamp: new Date().toISOString(),
        sessionType: 'automation',
        summary: 'Test session'
      });

      expect(fs.existsSync(path.join(testContextPath, 'session-history.json'))).toBe(true);
    });
  });
});

// Add zlib to require
const zlib = require('zlib');
