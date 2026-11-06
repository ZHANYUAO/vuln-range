"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logging_1 = __importDefault(require("@tryghost/logging"));
const define_service_1 = require("../../../kernel/define-service");
const adapter_manager_1 = __importDefault(require("../adapter-manager"));
const upgrade_service_1 = require("./upgrade-service");
// The adapter is resolved per call, so construction never contacts the host.
exports.default = (0, define_service_1.defineService)('Upgrades', () => new upgrade_service_1.UpgradeService({
    getAdapter: () => adapter_manager_1.default.getAdapter('upgrade'),
    logError: (error) => logging_1.default.error(error),
}));
