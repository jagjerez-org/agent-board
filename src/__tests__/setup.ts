// Test setup file
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

// Create temporary data directory for tests
const testDataDir = path.join(tmpdir(), 'agent-board-tests', Date.now().toString());

// Mock the DATA_DIR to use temp directory
Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true });
(global as Record<string, unknown>).__TEST_DATA_DIR__ = testDataDir;

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