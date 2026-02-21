// Test setup file
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

// Create temporary data directory for tests
const testDataDir = path.join(tmpdir(), 'agent-board-tests', Date.now().toString());

// Mock the DATA_DIR to use temp directory
// NODE_ENV is already set by vitest
(global as Record<string, unknown>).__TEST_DATA_DIR__ = testDataDir;

// Ensure test directories exist
await fs.mkdir(path.join(testDataDir, 'data', 'tasks'), { recursive: true });
await fs.mkdir(path.join(testDataDir, 'data', 'projects'), { recursive: true });
await fs.mkdir(path.join(testDataDir, 'data', 'agents'), { recursive: true });
await fs.mkdir(path.join(testDataDir, 'data', 'config'), { recursive: true });

// Clean up function — clear contents but keep directory structure
export async function cleanupTestDir() {
  const dirs = ['data/tasks', 'data/projects', 'data/agents', 'data/config'];
  for (const dir of dirs) {
    const fullPath = path.join(testDataDir, dir);
    try {
      const entries = await fs.readdir(fullPath);
      for (const entry of entries) {
        await fs.rm(path.join(fullPath, entry), { recursive: true, force: true });
      }
    } catch {
      // Dir might not exist, recreate it
      await fs.mkdir(fullPath, { recursive: true });
    }
  }
}

// Mock Next.js process.cwd() for storage
process.cwd = () => testDataDir;