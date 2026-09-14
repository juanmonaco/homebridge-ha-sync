import { LogParser, StateChangeEvent } from './types';
interface RegistryLogger {
    info(msg: string): void;
    warn(msg: string): void;
    debug(msg: string): void;
}
export declare class ParserRegistry {
    private readonly parsers;
    private readonly logger;
    constructor(logger: RegistryLogger);
    register(parser: LogParser): void;
    route(line: string): StateChangeEvent | null;
    loadFromDirectory(parsersDir: string): void;
}
export {};
//# sourceMappingURL=ParserRegistry.d.ts.map