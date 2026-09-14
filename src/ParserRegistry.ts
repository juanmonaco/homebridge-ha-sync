import * as fs from 'fs';
import * as path from 'path';
import { LogParser, StateChangeEvent } from './types';

interface RegistryLogger {
  info(msg: string): void;
  warn(msg: string): void;
  debug(msg: string): void;
}

export class ParserRegistry {
  private readonly parsers: LogParser[] = [];
  private readonly logger: RegistryLogger;

  constructor(logger: RegistryLogger) {
    this.logger = logger;
  }

  register(parser: LogParser): void {
    this.parsers.push(parser);
  }

  route(line: string): StateChangeEvent | null {
    for (const parser of this.parsers) {
      if (parser.canParse(line)) {
        return parser.parse(line);
      }
    }
    return null;
  }

  loadFromDirectory(parsersDir: string): void {
    let files: string[];
    try {
      files = fs.readdirSync(parsersDir).filter((f) => f.endsWith('.js'));
    } catch (err) {
      this.logger.warn(
        `ParserRegistry: could not read parsers directory "${parsersDir}": ${(err as Error).message}`
      );
      return;
    }

    for (const file of files) {
      const filePath = path.join(parsersDir, file);
      try {
        
        const mod = require(filePath) as Record<string, unknown>;
        const DefaultExport = mod.default ?? mod;

        // Check that the default export is a constructor whose prototype has
        // canParse and parse methods (i.e. implements LogParser).
        if (
          typeof DefaultExport === 'function' &&
          typeof (DefaultExport as { prototype?: Record<string, unknown> }).prototype?.['canParse'] === 'function' &&
          typeof (DefaultExport as { prototype?: Record<string, unknown> }).prototype?.['parse'] === 'function'
        ) {
          const instance = new (DefaultExport as new () => LogParser)();
          this.register(instance);
          this.logger.info(`ParserRegistry: loaded parser from "${file}"`);
        } else {
          this.logger.warn(
            `ParserRegistry: skipping "${file}" — default export does not implement LogParser`
          );
        }
      } catch (err) {
        this.logger.warn(
          `ParserRegistry: failed to load "${file}": ${(err as Error).message}`
        );
      }
    }
  }
}
