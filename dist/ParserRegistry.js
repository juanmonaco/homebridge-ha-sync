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
exports.ParserRegistry = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ParserRegistry {
    constructor(logger) {
        this.parsers = [];
        this.logger = logger;
    }
    register(parser) {
        this.parsers.push(parser);
    }
    route(line) {
        for (const parser of this.parsers) {
            if (parser.canParse(line)) {
                return parser.parse(line);
            }
        }
        return null;
    }
    loadFromDirectory(parsersDir) {
        let files;
        try {
            files = fs.readdirSync(parsersDir).filter((f) => f.endsWith('.js'));
        }
        catch (err) {
            this.logger.warn(`ParserRegistry: could not read parsers directory "${parsersDir}": ${err.message}`);
            return;
        }
        for (const file of files) {
            const filePath = path.join(parsersDir, file);
            try {
                const mod = require(filePath);
                const DefaultExport = mod.default ?? mod;
                // Check that the default export is a constructor whose prototype has
                // canParse and parse methods (i.e. implements LogParser).
                if (typeof DefaultExport === 'function' &&
                    typeof DefaultExport.prototype?.['canParse'] === 'function' &&
                    typeof DefaultExport.prototype?.['parse'] === 'function') {
                    const instance = new DefaultExport();
                    this.register(instance);
                    this.logger.info(`ParserRegistry: loaded parser from "${file}"`);
                }
                else {
                    this.logger.warn(`ParserRegistry: skipping "${file}" — default export does not implement LogParser`);
                }
            }
            catch (err) {
                this.logger.warn(`ParserRegistry: failed to load "${file}": ${err.message}`);
            }
        }
    }
}
exports.ParserRegistry = ParserRegistry;
//# sourceMappingURL=ParserRegistry.js.map