"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Debouncer = void 0;
class Debouncer {
    constructor(debounceMs, onSettle) {
        this.debounceMs = debounceMs;
        this.onSettle = onSettle;
        this.timers = new Map();
    }
    push(event) {
        const existing = this.timers.get(event.accessoryName);
        if (existing !== undefined) {
            clearTimeout(existing);
        }
        const timer = setTimeout(() => {
            this.timers.delete(event.accessoryName);
            this.onSettle(event);
        }, this.debounceMs);
        this.timers.set(event.accessoryName, timer);
    }
    clear(accessoryName) {
        const timer = this.timers.get(accessoryName);
        if (timer !== undefined) {
            clearTimeout(timer);
            this.timers.delete(accessoryName);
        }
    }
    clearAll() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
    }
}
exports.Debouncer = Debouncer;
//# sourceMappingURL=Debouncer.js.map