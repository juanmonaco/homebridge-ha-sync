// Minimal type declaration for the 'tail' package (no @types/tail available).
declare module 'tail' {
  import { EventEmitter } from 'events';

  interface TailOptions {
    separator?: RegExp | string | null;
    fsWatchOptions?: object;
    fromBeginning?: boolean;
    follow?: boolean;
    logger?: object;
    useWatchFile?: boolean;
    flushAtEOF?: boolean;
    encoding?: string;
    nLines?: number;
  }

  class Tail extends EventEmitter {
    constructor(filename: string, options?: TailOptions);
    watch(cursor?: number, flush?: boolean): void;
    unwatch(): void;
  }

  export { Tail };
}
