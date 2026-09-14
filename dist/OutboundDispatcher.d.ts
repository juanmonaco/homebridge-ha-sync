import { PluginConfig, StateChangeEvent } from './types';
import { StateStore } from './StateStore';
export interface Logger {
    info(msg: string): void;
    error(msg: string): void;
    debug(msg: string): void;
}
export declare class OutboundDispatcher {
    private readonly config;
    private readonly stateStore;
    private readonly logger;
    constructor(config: PluginConfig, stateStore: StateStore, logger: Logger);
    dispatch(event: StateChangeEvent): Promise<void>;
}
//# sourceMappingURL=OutboundDispatcher.d.ts.map