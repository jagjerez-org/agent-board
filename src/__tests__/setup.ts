// Test setup file
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

// Create temporary data directory for tests — unique per run
const testDataDir = path.join(tmpdir(), `agent-board-tests-${process.pid}`);

// Ensure test directories exist (synchronous-safe with await at top level)
const dirs = ['data/tasks', 'data/projects', 'data/agents', 'data/config'];
for (const dir of dirs) {
  await fs.mkdir(path.join(testDataDir, dir), { recursive: true });
}

// Mock Next.js process.cwd() for storage — must be set before any imports use it
process.cwd = () => testDataDir;

// Clean up function — clear task/project/agent files between tests
export async function cleanupTestDir() {
  for (const dir of dirs) {
    const fullPath = path.join(testDataDir, dir);
    try {
      const entries = await fs.readdir(fullPath);
      await Promise.all(
        entries.map(entry => fs.rm(path.join(fullPath, entry), { force: true }))
      );
    } catch {
      await fs.mkdir(fullPath, { recursive: true });
    }
  }
  // Also clean activity file
  try { await fs.rm(path.join(testDataDir, 'data', 'activity.jsonl'), { force: true }); } catch { /* ok */ }
}