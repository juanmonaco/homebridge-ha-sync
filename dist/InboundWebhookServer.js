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
exports.InboundWebhookServer = void 0;
const http = __importStar(require("http"));
function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}
class InboundWebhookServer {
    constructor(port, accessories, stateStore, logger) {
        this.port = port;
        this.accessories = accessories;
        this.stateStore = stateStore;
        this.logger = logger;
        this.server = null;
    }
    start() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                void this.handleRequest(req, res);
            });
            this.server.once('listening', () => {
                this.logger.info(`InboundWebhookServer: listening on port ${this.port}`);
                resolve();
            });
            this.server.once('error', (err) => {
                this.logger.error(`InboundWebhookServer: failed to bind port ${this.port}: ${err.message}`);
                reject(err);
            });
            this.server.listen(this.port);
        });
    }
    stop() {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async handleRequest(req, res) {
        // Only handle POST /webhook
        if (req.method !== 'POST' || req.url !== '/webhook') {
            sendJson(res, 404, {});
            return;
        }
        // Read body
        let rawBody;
        try {
            rawBody = await this.readBody(req);
        }
        catch {
            sendJson(res, 400, { error: 'Invalid request body' });
            return;
        }
        // Parse JSON
        let body;
        try {
            body = JSON.parse(rawBody);
        }
        catch {
            sendJson(res, 400, { error: 'Invalid request body' });
            return;
        }
        // Validate accessoryName
        const { accessoryName, value } = body;
        if (typeof accessoryName !== 'string' || accessoryName.trim() === '') {
            sendJson(res, 400, { error: 'Invalid request body' });
            return;
        }
        // Validate value
        const numericValue = Number(value);
        if ((typeof value !== 'number' && typeof value !== 'string') ||
            !isFinite(numericValue)) {
            sendJson(res, 400, { error: 'Invalid request body' });
            return;
        }
        // Look up accessory
        const accessory = this.accessories.get(accessoryName);
        if (!accessory) {
            sendJson(res, 404, { error: 'Accessory not found' });
            return;
        }
        // Record origin and update characteristic
        this.stateStore.recordInboundOrigin(accessoryName, numericValue);
        accessory.setValue(numericValue);
        this.logger.debug(`InboundWebhookServer: updated "${accessoryName}" to ${numericValue}`);
        sendJson(res, 200, { ok: true });
    }
    readBody(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
            req.on('error', reject);
        });
    }
}
exports.InboundWebhookServer = InboundWebhookServer;
//# sourceMappingURL=InboundWebhookServer.js.map