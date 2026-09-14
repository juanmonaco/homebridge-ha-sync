import { LogParser, StateChangeEvent } from '../types';
interface Logger {
    warn: (msg: string) => void;
}
export declare function formatLogLine(event: StateChangeEvent): string;
export default class WindowCoveringParser implements LogParser {
    private readonly logger;
    constructor(logger?: Logger);
    canParse(line: string): boolean;
    parse(line: string): StateChangeEvent | null;
}
export {};
//# sourceMappingURL=WindowCoveringParser.d.ts.map