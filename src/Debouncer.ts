import { StateChangeEvent } from './types';

export class Debouncer {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly debounceMs: number,
    private readonly onSettle: (event: StateChangeEvent) => void,
  ) {}

  push(event: StateChangeEvent): void {
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

  clear(accessoryName: string): void {
    const timer = this.timers.get(accessoryName);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(accessoryName);
    }
  }

  clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
