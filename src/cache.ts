import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

/** Eenvoudige cache als JSON-bestanden: data/<namespace>/<sha256>.json */
export class JsonCache {
  constructor(private readonly dir: string) {}

  static key(...parts: unknown[]): string {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
  }

  private file(ns: string, key: string): string {
    return path.join(this.dir, ns, `${key}.json`);
  }

  async get<T>(ns: string, key: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(this.file(ns, key), 'utf8')) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(ns: string, key: string, value: T): Promise<void> {
    const f = this.file(ns, key);
    await mkdir(path.dirname(f), { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await rename(tmp, f);
  }

  /** Haal uit de cache of bereken en bewaar. */
  async wrap<T>(ns: string, key: string, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(ns, key);
    if (hit !== undefined) return hit;
    const val = await fn();
    await this.set(ns, key, val);
    return val;
  }
}
