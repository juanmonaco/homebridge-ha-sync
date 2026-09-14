import { Tail } from 'tail';

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

const RETRY_INTERVAL_MS = 10_000;

export class LogTailer {
  private readonly filePath: string;
  private readonly onLine: (line: string) => void;
  private readonly onError: (err: Error) => void;
  private readonly logger: Logger;

  private tail: InstanceType<typeof Tail> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: LogTailerOptions) {
    this.filePath = options.filePath;
    this.onLine = options.onLine;
    this.onError = options.onError;
    this.logger = options.logger;
  }

  start(): void {
    this.openTail();
  }

  stop(): void {
    this.clearRetryTimer();
    if (this.tail) {
      try {
        this.tail.unwatch();
      } catch (err) {
        this.logger.warn(`LogTailer: error during unwatch for "${this.filePath}": ${err}`);
      }
      this.tail = null;
    }
    this.logger.info(`LogTailer: stopped watching "${this.filePath}"`);
  }

  // ---------- private ----------

  private openTail(): void {
    try {
      const tail = new Tail(this.filePath, { fromBeginning: false, follow: true });

      tail.on('line', (line: string) => {
        this.onLine(line);
      });

      tail.on('error', (err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`LogTailer: post-startup error on "${this.filePath}": ${error.message}`);
        // Discard the broken tail instance so the retry loop creates a fresh one
        try { tail.unwatch(); } catch { /* best-effort */ }
        this.tail = null;
        this.onError(error);
        this.scheduleRetry();
      });

      // Successfully opened — cancel any running retry timer
      this.clearRetryTimer();
      this.tail = tail;
      this.logger.info(`LogTailer: now watching "${this.filePath}"`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`LogTailer: failed to open "${this.filePath}": ${error.message}`);
      this.onError(error);
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) {
      // A retry interval is already running; don't stack another one
      return;
    }
    this.logger.info(`LogTailer: will retry "${this.filePath}" every ${RETRY_INTERVAL_MS / 1000}s`);
    this.retryTimer = setInterval(() => {
      this.logger.info(`LogTailer: retrying "${this.filePath}"…`);
      this.openTail();
    }, RETRY_INTERVAL_MS);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
