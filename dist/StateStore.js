"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateStore = void 0;
const promises_1 = require("fs/promises");
class StateStore {
    constructor(stateCachePath, logger) {
        this.stateCachePath = stateCachePath;
        this.logger = logger;
        this.positionCache = new Map();
        this.originTracker = new Map();
    }
    // ── Position cache ────────────────────────────────────────────────────────
    getPosition(name) {
        return this.positionCache.get(name);
    }
    setPosition(name, value) {
        this.positionCache.set(name, value);
        // Fire-and-forget; errors are handled inside saveToDisk
        void this.saveToDisk();
    }
    // ── Origin tracker ────────────────────────────────────────────────────────
    recordInboundOrigin(name, value) {
        this.originTracker.set(name, { value, ts: Date.now() });
    }
    isInboundOrigin(name, value, ttlMs) {
        const entry = this.originTracker.get(name);
        if (entry === undefined)
            return false;
        return entry.value === value && Date.now() - entry.ts <= ttlMs;
    }
    clearOrigin(name) {
        this.originTracker.delete(name);
    }
    // ── Disk persistence ──────────────────────────────────────────────────────
    async loadFromDisk() {
        if (!this.stateCachePath)
            return;
        try {
            const raw = await (0, promises_1.readFile)(this.stateCachePath, 'utf-8');
            const parsed = JSON.parse(raw);
            for (const [name, value] of Object.entries(parsed)) {
                if (typeof value === 'number') {
                    this.positionCache.set(name, value);
                }
            }
        }
        catch (err) {
            this.logger?.warn(`StateStore: could not load cache from "${this.stateCachePath}": ${err.message}. Starting with empty cache.`);
        }
    }
    async saveToDisk() {
        if (!this.stateCachePath)
            return;
        try {
            const obj = {};
            for (const [name, value] of this.positionCache) {
                obj[name] = value;
            }
            await (0, promises_1.writeFile)(this.stateCachePath, JSON.stringify(obj, null, 2), 'utf-8');
        }
        catch (err) {
            this.logger?.warn(`StateStore: could not save cache to "${this.stateCachePath}": ${err.message}. Continuing in memory-only mode.`);
        }
    }
}
exports.StateStore = StateStore;
//# sourceMappingURL=StateStore.js.map