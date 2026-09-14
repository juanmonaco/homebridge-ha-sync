import * as http from 'http';
import { StateStore } from './StateStore';
import { WebhookBody } from './types';

interface AccessoryHandle {
  setValue(value: number): void;
}

interface Logger {
  info(msg: string): void;
  error(msg: string): void;
  warn(msg: string): void;
  debug(msg: string): void;
}

function sendJson(res: http.ServerResponse, status: number, body: object): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export class InboundWebhookServer {
  private server: http.Server | null = null;

  constructor(
    private readonly port: number,
    private readonly accessories: Map<string, AccessoryHandle>,
    private readonly stateStore: StateStore,
    private readonly logger: Logger,
  ) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.once('listening', () => {
        this.logger.info(`InboundWebhookServer: listening on port ${this.port}`);
        resolve();
      });

      this.server.once('error', (err: NodeJS.ErrnoException) => {
        this.logger.error(
          `InboundWebhookServer: failed to bind port ${this.port}: ${err.message}`,
        );
        reject(err);
      });

      this.server.listen(this.port);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    // Only handle POST /webhook
    if (req.method !== 'POST' || req.url !== '/webhook') {
      sendJson(res, 404, {});
      return;
    }

    // Read body
    let rawBody: string;
    try {
      rawBody = await this.readBody(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid request body' });
      return;
    }

    // Parse JSON
    let body: WebhookBody;
    try {
      body = JSON.parse(rawBody) as WebhookBody;
    } catch {
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
    if (
      (typeof value !== 'number' && typeof value !== 'string') ||
      !isFinite(numericValue)
    ) {
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

    this.logger.debug(
      `InboundWebhookServer: updated "${accessoryName}" to ${numericValue}`,
    );

    sendJson(res, 200, { ok: true });
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }
}
