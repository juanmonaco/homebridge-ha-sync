"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogTailer = void 0;
const tail_1 = require("tail");
const RETRY_INTERVAL_MS = 10000;
class LogTailer {
    constructor(options) {
        this.tail = null;
        this.retryTimer = null;
        this.filePath = options.filePath;
        this.onLine = options.onLine;
        this.onError = options.onError;
        this.logger = options.logger;
    }
    start() {
        this.openTail();
    }
    stop() {
        this.clearRetryTimer();
        if (this.tail) {
            try {
                this.tail.unwatch();
            }
            catch (err) {
                this.logger.warn(`LogTailer: error during unwatch for "${this.filePath}": ${err}`);
            }
            this.tail = null;
        }
        this.logger.info(`LogTailer: stopped watching "${this.filePath}"`);
    }
    // ---------- private ----------
    openTail() {
        try {
            const tail = new tail_1.Tail(this.filePath, { fromBeginning: false, follow: true });
            tail.on('line', (line) => {
                this.onLine(line);
            });
            tail.on('error', (err) => {
                const error = err instanceof Error ? err : new Error(String(err));
                this.logger.warn(`LogTailer: post-startup error on "${this.filePath}": ${error.message}`);
                // Discard the broken tail instance so the retry loop creates a fresh one
                try {
                    tail.unwatch();
                }
                catch { /* best-effort */ }
                this.tail = null;
                this.onError(error);
                this.scheduleRetry();
            });
            // Successfully opened — cancel any running retry timer
            this.clearRetryTimer();
            this.tail = tail;
            this.logger.info(`LogTailer: now watching "${this.filePath}"`);
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.logger.error(`LogTailer: failed to open "${this.filePath}": ${error.message}`);
            this.onError(error);
            this.scheduleRetry();
        }
    }
    scheduleRetry() {
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
    clearRetryTimer() {
        if (this.retryTimer !== null) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }
    }
}
exports.LogTailer = LogTailer;
//# sourceMappingURL=LogTailer.js.map