export interface StateChangeEvent {
    accessoryName: string;
    value: number;
    timestamp: number;
}
export interface LogParser {
    canParse(line: string): boolean;
    parse(line: string): StateChangeEvent | null;
}
export interface AccessoryMapping {
    homebridgeName: string;
    entityId: string;
}
export interface PluginConfig {
    platform: string;
    name: string;
    haUrl: string;
    haToken: string;
    logFilePath: string;
    webhookPort: number;
    debounceMs: number;
    stateCachePath?: string;
    accessoryMappings: AccessoryMapping[];
}
export interface OriginEntry {
    value: number;
    ts: number;
}
export interface WebhookBody {
    accessoryName: string;
    value: number | string;
}
//# sourceMappingURL=types.d.ts.map