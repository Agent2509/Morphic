import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface WalkOptions {
  ignoreDirs?: ReadonlySet<string>;
  extensions?: ReadonlySet<string>;
  maxFiles?: number;
  signal?: AbortSignal;
}

const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".morphic",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".bun",
]);

export async function walkFiles(root: string, options: WalkOptions = {}): Promise<string[]> {
  const ignoreDirs = options.ignoreDirs ?? DEFAULT_IGNORE_DIRS;
  const out: string[] = [];
  const maxFiles = options.maxFiles ?? Infinity;

  async function walk(dir: string): Promise<void> {
    if (options.signal?.aborted || out.length >= maxFiles) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (options.signal?.aborted || out.length >= maxFiles) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(full);
      } else if (entry.isFile()) {
        if (options.extensions && !options.extensions.has(path.extname(entry.name))) continue;
        out.push(full);
      }
    }
  }

  try {
    const stat = await fs.stat(root);
    if (stat.isFile()) return [root];
  } catch {
    return out;
  }

  await walk(root);
  return out;
}
