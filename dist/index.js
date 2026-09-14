"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const LogTailer_1 = require("./LogTailer");
const ParserRegistry_1 = require("./ParserRegistry");
const Debouncer_1 = require("./Debouncer");
const StateStore_1 = require("./StateStore");
const OutboundDispatcher_1 = require("./OutboundDispatcher");
const InboundWebhookServer_1 = require("./InboundWebhookServer");
const PLATFORM_NAME = 'HomebridgeHaSync';
const PLUGIN_NAME = 'homebridge-ha-sync';
class HomebridgeHaSyncPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        // Accessories registered with this platform (won't include Broadlink ones)
        this.ownedAccessories = new Map();
        // All accessories discovered across all platforms (populated after didFinishLaunching)
        this.allAccessories = new Map();
        this.config = config;
        // Validate required config fields
        const requiredFields = ['haUrl', 'haToken', 'logFilePath', 'webhookPort'];
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
    configureAccessory(accessory) {
        this.ownedAccessories.set(accessory.displayName, accessory);
    }
    /**
     * After all plugins have loaded, walk the Homebridge internal accessory registry
     * to collect every accessory regardless of which plugin owns it.
     * We use (api as any)._bridge which is the HAP Bridge instance — the only way
     * to access cross-plugin accessories without requiring insecure mode.
     */
    discoverAllAccessories() {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bridge = this.api._bridge;
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
            const bridged = bridge.bridgedAccessories ?? [];
            let found = 0;
            for (const hapAccessory of bridged) {
                const name = hapAccessory.displayName ?? '';
                if (!name)
                    continue;
                // We only care about accessories that are in our mappings
                const isMapped = this.config.accessoryMappings.some((m) => m.homebridgeName === name);
                if (isMapped) {
                    // Wrap the raw HAP accessory so we can call updateCharacteristic on it
                    this.allAccessories.set(name, hapAccessory);
                    found++;
                    this.log.info(`HomebridgeHaSyncPlatform: discovered mapped accessory "${name}"`);
                }
            }
            if (found === 0 && this.config.accessoryMappings.length > 0) {
                this.log.warn('HomebridgeHaSyncPlatform: no mapped accessories found in bridge. ' +
                    'Make sure homebridgeName values in accessoryMappings exactly match the Homebridge accessory names.');
            }
        }
        catch (err) {
            this.log.warn(`HomebridgeHaSyncPlatform: error discovering accessories: ${err.message}`);
        }
    }
    /**
     * Given an accessory name, update its WindowCovering characteristics.
     * This is what gets called when HA sends a position update via the inbound webhook.
     */
    updateAccessoryPosition(name, position) {
        const accessory = this.allAccessories.get(name);
        if (!accessory) {
            this.log.warn(`HomebridgeHaSyncPlatform: accessory "${name}" not found for inbound update`);
            return;
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const hapAcc = accessory;
            // Find the WindowCovering service — check both direct services array and
            // the nested bridgedAccessories structure depending on Homebridge version
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let wcService = null;
            // Standard: accessory has a .services array
            if (Array.isArray(hapAcc.services)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                wcService = hapAcc.services.find((s) => s.UUID === this.Service.WindowCovering.UUID);
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
        }
        catch (err) {
            this.log.error(`HomebridgeHaSyncPlatform: failed to update "${name}": ${err.message}`);
        }
    }
    async startComponents() {
        try {
            // 1. StateStore
            this.stateStore = new StateStore_1.StateStore(this.config.stateCachePath, { warn: (msg) => this.log.warn(msg) });
            if (this.config.stateCachePath) {
                await this.stateStore.loadFromDisk();
            }
            // 2. Debouncer → OutboundDispatcher
            this.outboundDispatcher = new OutboundDispatcher_1.OutboundDispatcher(this.config, this.stateStore, {
                info: (msg) => this.log.info(msg),
                error: (msg) => this.log.error(msg),
                debug: (msg) => this.log.debug(msg),
            });
            this.debouncer = new Debouncer_1.Debouncer(this.config.debounceMs, (event) => {
                this.outboundDispatcher.dispatch(event).catch((err) => {
                    this.log.error(`Outbound dispatch error: ${err.message}`);
                });
            });
            // 3. ParserRegistry — loads parsers from dist/parsers/
            this.parserRegistry = new ParserRegistry_1.ParserRegistry({
                info: (msg) => this.log.info(msg),
                warn: (msg) => this.log.warn(msg),
                debug: (msg) => this.log.debug(msg),
            });
            this.parserRegistry.loadFromDirectory(path.join(__dirname, 'parsers'));
            // 4. LogTailer
            this.logTailer = new LogTailer_1.LogTailer({
                filePath: this.config.logFilePath,
                onLine: (line) => {
                    const event = this.parserRegistry?.route(line);
                    if (event) {
                        this.debouncer?.push(event);
                    }
                },
                onError: (err) => {
                    this.log.error(`LogTailer error: ${err.message}`);
                },
                logger: {
                    info: (msg) => this.log.info(msg),
                    warn: (msg) => this.log.warn(msg),
                    error: (msg) => this.log.error(msg),
                    debug: (msg) => this.log.debug(msg),
                },
            });
            this.logTailer.start();
            // 5. InboundWebhookServer
            // Build handles that call updateAccessoryPosition for each mapped accessory
            const accessoryHandles = new Map();
            for (const mapping of this.config.accessoryMappings) {
                const name = mapping.homebridgeName;
                accessoryHandles.set(name, {
                    setValue: (value) => {
                        this.updateAccessoryPosition(name, value);
                    },
                });
            }
            this.webhookServer = new InboundWebhookServer_1.InboundWebhookServer(this.config.webhookPort, accessoryHandles, this.stateStore, {
                info: (msg) => this.log.info(msg),
                error: (msg) => this.log.error(msg),
                warn: (msg) => this.log.warn(msg),
                debug: (msg) => this.log.debug(msg),
            });
            await this.webhookServer.start();
            this.log.info(`HomebridgeHaSyncPlatform: started — watching ${this.config.accessoryMappings.length} accessory mapping(s), inbound webhook on port ${this.config.webhookPort}`);
        }
        catch (err) {
            this.log.error(`HomebridgeHaSyncPlatform: failed to start: ${err.message}`);
        }
    }
    async stop() {
        this.log.info('HomebridgeHaSyncPlatform: stopping...');
        this.debouncer?.clearAll();
        this.logTailer?.stop();
        await this.webhookServer?.stop();
        this.log.info('HomebridgeHaSyncPlatform: stopped');
    }
}
exports.default = (api) => {
    api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, HomebridgeHaSyncPlatform);
};
//# sourceMappingURL=index.js.map