interface Logger {
    warn: (msg: string) => void;
}
export declare class StateStore {
    private readonly stateCachePath?;
    private readonly logger?;
    private readonly positionCache;
    private readonly originTracker;
    constructor(stateCachePath?: string | undefined, logger?: Logger | undefined);
    getPosition(name: string): number | undefined;
    setPosition(name: string, value: number): void;
    recordInboundOrigin(name: string, value: number): void;
    isInboundOrigin(name: string, value: number, ttlMs: number): boolean;
    clearOrigin(name: string): void;
    loadFromDisk(): Promise<void>;
    saveToDisk(): Promise<void>;
}
export {};
//# sourceMappingURL=StateStore.d.ts.map