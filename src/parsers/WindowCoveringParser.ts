import { LogParser, StateChangeEvent } from '../types';

interface Logger {
  warn: (msg: string) => void;
}

const PATTERN = /^\[.*?\] \[Broadlink RM\] (.+?) setCurrentPosition: (\d+)$/;

export function formatLogLine(event: StateChangeEvent): string {
  return `[${new Date(event.timestamp).toISOString()}] [Broadlink RM] ${event.accessoryName} setCurrentPosition: ${event.value}`;
}

export default class WindowCoveringParser implements LogParser {
  private readonly logger: Logger;

  constructor(logger: Logger = { warn: () => undefined }) {
    this.logger = logger;
  }

  canParse(line: string): boolean {
    return line.includes('[Broadlink RM]') && line.includes('setCurrentPosition');
  }

  parse(line: string): StateChangeEvent | null {
    const match = PATTERN.exec(line);
    if (!match) {
      return null;
    }

    const accessoryName = match[1].trim();
    const rawValue = match[2];

    // Verify the value is an integer (no decimal point in the captured digits)
    const value = parseInt(rawValue, 10);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      this.logger.warn(
        `WindowCoveringParser: position value "${rawValue}" is out of range [0, 100] — ignoring line`
      );
      return null;
    }

    return {
      accessoryName,
      value,
      timestamp: Date.now(),
    };
  }
}
