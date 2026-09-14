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

const PLATFORM_NAME = 'HomebridgeHaSync';
const PLUGIN_NAME = 'homebridge-ha-sync';

class HomebridgeHaSyncPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  private readonly config: PluginConfig;
  private readonly accessories = new Map<string, PlatformAccessory>();
  
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
    if (!this.config.debounceMs) {
      this.config.debounceMs = 1500;
    }
    if (!this.config.accessoryMappings) {
      this.config.accessoryMappings = [];
    }

    this.log.debug('HomebridgeHaSyncPlatform initialized');

    // Start components when homebridge is ready
    this.api.on('didFinishLaunching', () => {
      this.startComponents();
    });

    // Clean shutdown
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.displayName, accessory);
  }

  private async startComponents() {
    try {
      // 1. StateStore
      this.stateStore = new StateStore(
        this.config.stateCachePath,
        { warn: (msg) => this.log.warn(msg) }
      );
      
      if (this.config.stateCachePath) {
        await this.stateStore.loadFromDisk();
      }

      // 2. Debouncer
      this.debouncer = new Debouncer(
        this.config.debounceMs,
        (event: StateChangeEvent) => {
          this.outboundDispatcher?.dispatch(event).catch((err) => {
            this.log.error('Outbound dispatch error:', err.message);
          });
        }
      );

      // 3. OutboundDispatcher
      this.outboundDispatcher = new OutboundDispatcher(
        this.config,
        this.stateStore,
        {
          info: (msg) => this.log.info(msg),
          error: (msg) => this.log.error(msg),
          debug: (msg) => this.log.debug(msg),
        } as DispatcherLogger
      );

      // 4. ParserRegistry (loads parsers from dist/parsers/)
      this.parserRegistry = new ParserRegistry({
        info: (msg) => this.log.info(msg),
        warn: (msg) => this.log.warn(msg),
        debug: (msg) => this.log.debug(msg),
      });
      
      const parsersDir = path.join(__dirname, 'parsers');
      this.parserRegistry.loadFromDirectory(parsersDir);

      // 5. LogTailer
      this.logTailer = new LogTailer({
        filePath: this.config.logFilePath,
        onLine: (line: string) => {
          const event = this.parserRegistry?.route(line);
          if (event) {
            this.debouncer?.push(event);
          }
        },
        onError: (err: Error) => {
          this.log.error('LogTailer error:', err.message);
        },
        logger: {
          info: (msg) => this.log.info(msg),
          warn: (msg) => this.log.warn(msg),
          error: (msg) => this.log.error(msg),
          debug: (msg) => this.log.debug(msg),
        } as TailerLogger,
      });
      this.logTailer.start();

      // 6. InboundWebhookServer
      const accessoryHandles = new Map<string, { setValue(value: number): void }>();
      for (const [name] of this.accessories.entries()) {
        // Create a simple handle for each accessory
        accessoryHandles.set(name, {
          setValue: (value: number) => {
            // Update accessory characteristic - simplified for now
            this.log.debug(`Setting ${name} to ${value}%`);
          }
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
        }
      );
      
      await this.webhookServer.start();

      this.log.info('HomebridgeHaSyncPlatform: all components started successfully');

    } catch (error) {
      this.log.error('Failed to start components:', error);
    }
  }

  private async stop() {
    this.log.info('HomebridgeHaSyncPlatform: stopping...');
    
    this.debouncer?.clearAll();
    this.logTailer?.stop();
    
    if (this.webhookServer) {
      await this.webhookServer.stop();
    }

    this.log.info('HomebridgeHaSyncPlatform: stopped');
  }
}

// Re-export types for third-party parser developers
export { LogParser, StateChangeEvent } from './types';

// Default export the plugin registration function
export default (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, HomebridgeHaSyncPlatform);
};