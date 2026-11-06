"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.moment = void 0;
exports.getUnixTime = getUnixTime;
const moment_timezone_1 = __importDefault(require("moment-timezone"));
/** @deprecated Compatibility export for existing date logic. Prefer clock helpers where available. */
exports.moment = moment_timezone_1.default;
/** Returns the current Unix time in whole seconds. */
function getUnixTime() {
    return (0, moment_timezone_1.default)().unix();
}
