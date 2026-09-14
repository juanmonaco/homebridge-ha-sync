import axios from 'axios';
import { PluginConfig, StateChangeEvent } from './types';
import { StateStore } from './StateStore';

export interface Logger {
  info(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

export class OutboundDispatcher {
  constructor(
    private readonly config: PluginConfig,
    private readonly stateStore: StateStore,
    private readonly logger: Logger,
  ) {}

  async dispatch(event: StateChangeEvent): Promise<void> {
    // 1. Look up entity ID by homebridgeName
    const mapping = this.config.accessoryMappings.find(
      (m) => m.homebridgeName === event.accessoryName,
    );
    if (mapping === undefined) {
      return;
    }
    const { entityId } = mapping;

    // 2. Dedup check — skip if same value already sent
    if (this.stateStore.getPosition(event.accessoryName) === event.value) {
      this.logger.debug(
        `OutboundDispatcher: dedup — ${entityId} already at ${event.value}%, skipping POST`,
      );
      return;
    }

    // 3. Feedback-loop origin check
    const ttlMs = this.config.debounceMs * 2;
    if (this.stateStore.isInboundOrigin(event.accessoryName, event.value, ttlMs)) {
      this.stateStore.clearOrigin(event.accessoryName);
      this.logger.debug(
        `OutboundDispatcher: suppressed echo — ${entityId} value ${event.value}% originated from HA`,
      );
      return;
    }

    // 4. POST to HA REST API
    const url = `${this.config.haUrl}/api/states/${entityId}`;
    const body = {
      state: String(event.value),
      attributes: { unit_of_measurement: '%' },
    };
    const headers = { Authorization: `Bearer ${this.config.haToken}` };

    try {
      const response = await axios.post(url, body, { headers, timeout: 5000 });

      // 5. On 2xx: update cache and log success
      if (response.status >= 200 && response.status < 300) {
        this.stateStore.setPosition(event.accessoryName, event.value);
        this.logger.info(`OutboundDispatcher: Synced ${entityId} → ${event.value}%`);
      } else {
        // 6. Non-2xx from axios (shouldn't normally reach here due to axios throwing, but guard anyway)
        const bodySnippet = JSON.stringify(response.data).slice(0, 200);
        this.logger.error(
          `OutboundDispatcher: HA returned ${response.status} for ${entityId}: ${bodySnippet}`,
        );
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response !== undefined) {
        // 6. Non-2xx HTTP response (axios throws for these by default)
        const bodySnippet = JSON.stringify(err.response.data).slice(0, 200);
        this.logger.error(
          `OutboundDispatcher: HA returned ${err.response.status} for ${entityId}: ${bodySnippet}`,
        );
      } else {
        // 7. Network / timeout error
        this.logger.error(
          `OutboundDispatcher: network error posting to ${entityId}: ${(err as Error).message}`,
        );
      }
    }
  }
}
