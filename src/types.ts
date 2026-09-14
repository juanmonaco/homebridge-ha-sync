export interface StateChangeEvent {
  accessoryName: string;
  value: number;        // 0–100 for window coverings
  timestamp: number;    // Date.now() at parse time
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
  verbose?: boolean;
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
