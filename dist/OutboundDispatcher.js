"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboundDispatcher = void 0;
const axios_1 = __importDefault(require("axios"));
class OutboundDispatcher {
    constructor(config, stateStore, logger) {
        this.config = config;
        this.stateStore = stateStore;
        this.logger = logger;
    }
    async dispatch(event) {
        // 1. Look up entity ID by homebridgeName
        const mapping = this.config.accessoryMappings.find((m) => m.homebridgeName === event.accessoryName);
        if (mapping === undefined) {
            this.logger.debug(`[ha-sync] → no mapping for "${event.accessoryName}" — skipping`);
            return;
        }
        const { entityId } = mapping;
        // 2. Dedup check — skip if same value already sent
        if (this.stateStore.getPosition(event.accessoryName) === event.value) {
            this.logger.debug(`[ha-sync] → skipped ${entityId} (already at ${event.value}%)`);
            return;
        }
        // 3. Feedback-loop origin check
        const ttlMs = this.config.debounceMs * 2;
        if (this.stateStore.isInboundOrigin(event.accessoryName, event.value, ttlMs)) {
            this.stateStore.clearOrigin(event.accessoryName);
            this.logger.debug(`[ha-sync] → suppressed echo for "${event.accessoryName}" @ ${event.value}% (originated from HA)`);
            return;
        }
        // 4. POST to HA REST API
        const url = `${this.config.haUrl}/api/states/${entityId}`;
        // Derive state string from position
        const haState = event.value === 0 ? 'closed' : 'open';
        const body = {
            state: haState,
            attributes: {
                current_position: event.value,
                is_closed: event.value === 0,
                device_class: 'blind',
            },
        };
        const headers = { Authorization: `Bearer ${this.config.haToken}` };
        try {
            const response = await axios_1.default.post(url, body, { headers, timeout: 5000 });
            // 5. On 2xx: update cache and log success
            if (response.status >= 200 && response.status < 300) {
                this.stateStore.setPosition(event.accessoryName, event.value);
                this.logger.info(`[ha-sync] → HA ${entityId} = ${event.value}%`);
            }
            else {
                // 6. Non-2xx from axios (shouldn't normally reach here due to axios throwing, but guard anyway)
                const bodySnippet = JSON.stringify(response.data).slice(0, 200);
                this.logger.error(`[ha-sync] → HA ${entityId} failed — HTTP ${response.status}: ${bodySnippet}`);
            }
        }
        catch (err) {
            if (axios_1.default.isAxiosError(err) && err.response !== undefined) {
                // 6. Non-2xx HTTP response (axios throws for these by default)
                const bodySnippet = JSON.stringify(err.response.data).slice(0, 200);
                this.logger.error(`[ha-sync] → HA ${entityId} failed — HTTP ${err.response.status}: ${bodySnippet}`);
            }
            else {
                // 7. Network / timeout error
                this.logger.error(`[ha-sync] → HA ${entityId} failed — ${err.message}`);
            }
        }
    }
}
exports.OutboundDispatcher = OutboundDispatcher;
//# sourceMappingURL=OutboundDispatcher.js.map