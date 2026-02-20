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

// Clean up function
export async function cleanupTestDir() {
  try {
    await fs.rm(testDataDir, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

// Mock Next.js process.cwd() for storage
process.cwd = () => testDataDir;