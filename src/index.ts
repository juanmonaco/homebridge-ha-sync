import {
  API,
  DynamicPlatformPlugin,
  Logger as HomebridgeLogger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import * as path from 'path';
import { LogTailer, Logger as TailerLogger } from './LogTailer';
import { ParserRegistry } from './ParserRegistry';
import { Debouncer } from './Debouncer';
import { StateStore } from './StateStore';
import { OutboundDispatcher, Logger as DispatcherLogger } from './OutboundDispatcher';
import { InboundWebhookServer } from './InboundWebhookServer';
import { PluginConfig, StateChangeEvent } from './types';

// Re-export types for third-party parser developers
export { LogParser, StateChangeEvent } from './types';

const PLATFORM_NAME = 'HomebridgeHaSync';
const PLUGIN_NAME = 'homebridge-ha-sync';

class HomebridgeHaSyncPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  private readonly config: PluginConfig;

  // Accessories registered with this platform (won't include Broadlink ones)
  private readonly ownedAccessories = new Map<string, PlatformAccessory>();

  // All accessories discovered across all platforms (populated after didFinishLaunching)
  private readonly allAccessories = new Map<string, PlatformAccessory>();

  // Components
  private stateStore?: StateStore;
  private debouncer?: Debouncer;
  private outboundDispatcher?: OutboundDispatcher;
  private parserRegistry?: ParserRegistry;
  private logTailer?: LogTailer;
  private webhookServer?: InboundWebhookServer;

  constructor(
    public readonly log: HomebridgeLogger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.config = config as PluginConfig;

    // Validate required config fields
    const requiredFields = ['haUrl', 'haToken', 'logFilePath', 'webhookPort'] as const;
    for (const field of requiredFields) {
      if (!this.config[field]) {
        this.log.error(`HomebridgeHaSyncPlatform: missing required config field "${field}"`);
        return;
      }
    }

    // Set defaults
    this.config.debounceMs = this.config.debounceMs ?? 1500;
    this.config.accessoryMappings = this.config.accessoryMappings ?? [];

    this.log.debug('HomebridgeHaSyncPlatform initialized');

    this.api.on('didFinishLaunching', () => {
      this.discoverAllAccessories();
      void this.startComponents();
    });

    process.on('SIGTERM', () => void this.stop());
    process.on('SIGINT', () => void this.stop());
  }

  // Called by Homebridge for accessories cached under THIS platform only
  configureAccessory(accessory: PlatformAccessory): void {
    this.ownedAccessories.set(accessory.displayName, accessory);
  }

  /**
   * After all plugins have loaded, walk the Homebridge internal accessory registry
   * to collect every accessory regardless of which plugin owns it.
   * We use (api as any)._bridge which is the HAP Bridge instance — the only way
   * to access cross-plugin accessories without requiring insecure mode.
   */
  private discoverAllAccessories(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = (this.api as any)._bridge;
      if (!bridge) {
        this.log.warn('HomebridgeHaSyncPlatform: cannot access bridge — inbound updates will be limited to owned accessories');
        // Fall back to owned accessories
        for (const [name, acc] of this.ownedAccessories) {
          this.allAccessories.set(name, acc);
        }
        return;
      }

      // The bridge has a .bridgedAccessories array of HAP Accessory objects
      // and each has a displayName. We match by displayName against our mappings.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridged: any[] = bridge.bridgedAccessories ?? [];
      let found = 0;
      for (const hapAccessory of bridged) {
        const name: string = hapAccessory.displayName ?? '';
        if (!name) continue;
        // We only care about accessories that are in our mappings
        const isMapped = this.config.accessoryMappings.some(
          (m) => m.homebridgeName === name,
        );
        if (isMapped) {
          // Wrap the raw HAP accessory so we can call updateCharacteristic on it
          this.allAccessories.set(name, hapAccessory as unknown as PlatformAccessory);
          found++;
          this.log.info(`HomebridgeHaSyncPlatform: discovered mapped accessory "${name}"`);
        }
      }

      if (found === 0 && this.config.accessoryMappings.length > 0) {
        this.log.warn(
          'HomebridgeHaSyncPlatform: no mapped accessories found in bridge. ' +
          'Make sure homebridgeName values in accessoryMappings exactly match the Homebridge accessory names.',
        );
      }
    } catch (err) {
      this.log.warn(`HomebridgeHaSyncPlatform: error discovering accessories: ${(err as Error).message}`);
    }
  }

  /**
   * Given an accessory name, update its WindowCovering characteristics.
   * This is what gets called when HA sends a position update via the inbound webhook.
   */
  private updateAccessoryPosition(name: string, position: number): void {
    const accessory = this.allAccessories.get(name);
    if (!accessory) {
      this.log.warn(`HomebridgeHaSyncPlatform: accessory "${name}" not found for inbound update`);
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hapAcc = accessory as any;

      // Find the WindowCovering service — check both direct services array and
      // the nested bridgedAccessories structure depending on Homebridge version
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let wcService: any = null;

      // Standard: accessory has a .services array
      if (Array.isArray(hapAcc.services)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wcService = hapAcc.services.find((s: any) =>
          s.UUID === this.Service.WindowCovering.UUID,
        );
      }

      if (!wcService) {
        // Try getService if it's a PlatformAccessory
        wcService = hapAcc.getService?.(this.Service.WindowCovering);
      }

      if (!wcService) {
        this.log.warn(`HomebridgeHaSyncPlatform: no WindowCovering service on "${name}"`);
        return;
      }

      // Update CurrentPosition, TargetPosition, and PositionState
      const clampedPosition = Math.max(0, Math.min(100, Math.round(position)));

      wcService.getCharacteristic(this.Characteristic.CurrentPosition)
        ?.updateValue(clampedPosition);
      wcService.getCharacteristic(this.Characteristic.TargetPosition)
        ?.updateValue(clampedPosition);
      wcService.getCharacteristic(this.Characteristic.PositionState)
        ?.updateValue(this.Characteristic.PositionState.STOPPED);

      this.log.info(`HomebridgeHaSyncPlatform: updated "${name}" position → ${clampedPosition}%`);
    } catch (err) {
      this.log.error(
        `HomebridgeHaSyncPlatform: failed to update "${name}": ${(err as Error).message}`,
      );
    }
  }

  private async startComponents(): Promise<void> {
    try {
      // 1. StateStore
      this.stateStore = new StateStore(
        this.config.stateCachePath,
        { warn: (msg) => this.log.warn(msg) },
      );
      if (this.config.stateCachePath) {
        await this.stateStore.loadFromDisk();
      }

      // 2. Debouncer → OutboundDispatcher
      this.outboundDispatcher = new OutboundDispatcher(
        this.config,
        this.stateStore,
        {
          info: (msg) => this.log.info(msg),
          error: (msg) => this.log.error(msg),
          debug: (msg) => this.log.debug(msg),
        } as DispatcherLogger,
      );

      this.debouncer = new Debouncer(
        this.config.debounceMs,
        (event: StateChangeEvent) => {
          this.outboundDispatcher!.dispatch(event).catch((err) => {
            this.log.error(`Outbound dispatch error: ${(err as Error).message}`);
          });
        },
      );

      // 3. ParserRegistry — loads parsers from dist/parsers/
      this.parserRegistry = new ParserRegistry({
        info: (msg) => this.log.info(msg),
        warn: (msg) => this.log.warn(msg),
        debug: (msg) => this.log.debug(msg),
      });
      this.parserRegistry.loadFromDirectory(path.join(__dirname, 'parsers'));

      // 4. LogTailer
      this.logTailer = new LogTailer({
        filePath: this.config.logFilePath,
        onLine: (line: string) => {
          const event = this.parserRegistry?.route(line);
          if (event) {
            this.debouncer?.push(event);
          }
        },
        onError: (err: Error) => {
          this.log.error(`LogTailer error: ${err.message}`);
        },
        logger: {
          info: (msg) => this.log.info(msg),
          warn: (msg) => this.log.warn(msg),
          error: (msg) => this.log.error(msg),
          debug: (msg) => this.log.debug(msg),
        } as TailerLogger,
      });
      this.logTailer.start();

      // 5. InboundWebhookServer
      // Build handles that call updateAccessoryPosition for each mapped accessory
      const accessoryHandles = new Map<string, { setValue(value: number): void }>();
      for (const mapping of this.config.accessoryMappings) {
        const name = mapping.homebridgeName;
        accessoryHandles.set(name, {
          setValue: (value: number) => {
            this.updateAccessoryPosition(name, value);
          },
        });
      }

      this.webhookServer = new InboundWebhookServer(
        this.config.webhookPort,
        accessoryHandles,
        this.stateStore,
        {
          info: (msg) => this.log.info(msg),
          error: (msg) => this.log.error(msg),
          warn: (msg) => this.log.warn(msg),
          debug: (msg) => this.log.debug(msg),
        },
      );
      await this.webhookServer.start();

      this.log.info(
        `HomebridgeHaSyncPlatform: started — watching ${this.config.accessoryMappings.length} accessory mapping(s), inbound webhook on port ${this.config.webhookPort}`,
      );
    } catch (err) {
      this.log.error(`HomebridgeHaSyncPlatform: failed to start: ${(err as Error).message}`);
    }
  }

  private async stop(): Promise<void> {
    this.log.info('HomebridgeHaSyncPlatform: stopping...');
    this.debouncer?.clearAll();
    this.logTailer?.stop();
    await this.webhookServer?.stop();
    this.log.info('HomebridgeHaSyncPlatform: stopped');
  }
}

export default (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, HomebridgeHaSyncPlatform);
};
