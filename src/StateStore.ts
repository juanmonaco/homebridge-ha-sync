import { readFile, writeFile } from 'fs/promises';
import { OriginEntry } from './types';

interface Logger {
  warn: (msg: string) => void;
}

export class StateStore {
  private readonly positionCache = new Map<string, number>();
  private readonly originTracker = new Map<string, OriginEntry>();

  constructor(
    private readonly stateCachePath?: string,
    private readonly logger?: Logger,
  ) {}

  // ── Position cache ────────────────────────────────────────────────────────

  getPosition(name: string): number | undefined {
    return this.positionCache.get(name);
  }

  setPosition(name: string, value: number): void {
    this.positionCache.set(name, value);
    // Fire-and-forget; errors are handled inside saveToDisk
    void this.saveToDisk();
  }

  // ── Origin tracker ────────────────────────────────────────────────────────

  recordInboundOrigin(name: string, value: number): void {
    this.originTracker.set(name, { value, ts: Date.now() });
  }

  isInboundOrigin(name: string, value: number, ttlMs: number): boolean {
    const entry = this.originTracker.get(name);
    if (entry === undefined) return false;
    return entry.value === value && Date.now() - entry.ts <= ttlMs;
  }

  clearOrigin(name: string): void {
    this.originTracker.delete(name);
  }

  // ── Disk persistence ──────────────────────────────────────────────────────

  async loadFromDisk(): Promise<void> {
    if (!this.stateCachePath) return;
    try {
      const raw = await readFile(this.stateCachePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, number>;
      for (const [name, value] of Object.entries(parsed)) {
        if (typeof value === 'number') {
          this.positionCache.set(name, value);
        }
      }
    } catch (err) {
      this.logger?.warn(
        `StateStore: could not load cache from "${this.stateCachePath}": ${(err as Error).message}. Starting with empty cache.`,
      );
    }
  }

  async saveToDisk(): Promise<void> {
    if (!this.stateCachePath) return;
    try {
      const obj: Record<string, number> = {};
      for (const [name, value] of this.positionCache) {
        obj[name] = value;
      }
      await writeFile(this.stateCachePath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      this.logger?.warn(
        `StateStore: could not save cache to "${this.stateCachePath}": ${(err as Error).message}. Continuing in memory-only mode.`,
      );
    }
  }
}
