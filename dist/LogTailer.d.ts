export interface Logger {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
}
export interface LogTailerOptions {
    filePath: string;
    onLine: (line: string) => void;
    onError: (err: Error) => void;
    logger: Logger;
}
export declare class LogTailer {
    private readonly filePath;
    private readonly onLine;
    private readonly onError;
    private readonly logger;
    private tail;
    private retryTimer;
    constructor(options: LogTailerOptions);
    start(): void;
    stop(): void;
    private openTail;
    private scheduleRetry;
    private clearRetryTimer;
}
//# sourceMappingURL=LogTailer.d.ts.map