import { StateChangeEvent } from './types';
export declare class Debouncer {
    private readonly debounceMs;
    private readonly onSettle;
    private timers;
    constructor(debounceMs: number, onSettle: (event: StateChangeEvent) => void);
    push(event: StateChangeEvent): void;
    clear(accessoryName: string): void;
    clearAll(): void;
}
//# sourceMappingURL=Debouncer.d.ts.map