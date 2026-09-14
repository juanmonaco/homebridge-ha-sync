import { StateStore } from './StateStore';
interface AccessoryHandle {
    setValue(value: number): void;
}
interface Logger {
    info(msg: string): void;
    error(msg: string): void;
    warn(msg: string): void;
    debug(msg: string): void;
}
export declare class InboundWebhookServer {
    private readonly port;
    private readonly accessories;
    private readonly stateStore;
    private readonly logger;
    private server;
    constructor(port: number, accessories: Map<string, AccessoryHandle>, stateStore: StateStore, logger: Logger);
    start(): Promise<void>;
    stop(): Promise<void>;
    private handleRequest;
    private readBody;
}
export {};
//# sourceMappingURL=InboundWebhookServer.d.ts.map