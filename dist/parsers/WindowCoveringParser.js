"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatLogLine = formatLogLine;
const PATTERN = /^\[.*?\] \[Broadlink RM\] (.+?) setCurrentPosition: (\d+)$/;
function formatLogLine(event) {
    return `[${new Date(event.timestamp).toISOString()}] [Broadlink RM] ${event.accessoryName} setCurrentPosition: ${event.value}`;
}
class WindowCoveringParser {
    constructor(logger = { warn: () => undefined }) {
        this.logger = logger;
    }
    canParse(line) {
        return line.includes('[Broadlink RM]') && line.includes('setCurrentPosition');
    }
    parse(line) {
        const match = PATTERN.exec(line);
        if (!match) {
            return null;
        }
        const accessoryName = match[1].trim();
        const rawValue = match[2];
        // Verify the value is an integer (no decimal point in the captured digits)
        const value = parseInt(rawValue, 10);
        if (!Number.isInteger(value) || value < 0 || value > 100) {
            this.logger.warn(`WindowCoveringParser: position value "${rawValue}" is out of range [0, 100] — ignoring line`);
            return null;
        }
        return {
            accessoryName,
            value,
            timestamp: Date.now(),
        };
    }
}
exports.default = WindowCoveringParser;
//# sourceMappingURL=WindowCoveringParser.js.map