"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkVersionMatch = void 0;
const errors_1 = __importDefault(require("@tryghost/errors"));
const tpl_1 = __importDefault(require("@tryghost/tpl"));
const semver_1 = __importDefault(require("semver"));
const messages = {
    invalidClientVersionRange: 'Client request for {clientVersion} is invalid.',
    versionMismatch: 'Client request for {clientVersion} does not match server version {serverVersion}.',
};
const checkVersionMatch = (req, res, next) => {
    const clientVersion = req.get('X-Ghost-Version');
    if (clientVersion) {
        const constraint = '^' + clientVersion + '.0';
        // Protect against invalid client ranges
        if (!semver_1.default.validRange(constraint)) {
            return next(new errors_1.default.BadRequestError({
                message: (0, tpl_1.default)(messages.invalidClientVersionRange, {
                    clientVersion,
                }),
            }));
        }
        // can contain pre-release suffix, you should be able to use e.g. 1.19.0-pre [server] with 1.18.0 [client]
        const serverVersion = res.locals.version.match(/^(\d+\.)?(\d+\.)?(\d+)/)[0];
        // no error when client is on an earlier minor version than server
        // error when client is on a later minor version than server
        // always error when the major version is different
        if (!semver_1.default.satisfies(serverVersion, constraint)) {
            return next(new errors_1.default.VersionMismatchError({
                message: (0, tpl_1.default)(messages.versionMismatch, {
                    clientVersion,
                    serverVersion,
                }),
            }));
        }
    }
    next();
};
exports.checkVersionMatch = checkVersionMatch;
