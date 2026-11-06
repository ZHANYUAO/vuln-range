"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = exports.limitService = void 0;
const errors_1 = __importDefault(require("@tryghost/errors"));
const logging_1 = __importDefault(require("@tryghost/logging"));
const limit_service_1 = require("@tryghost/limit-service");
const config_1 = __importDefault(require("../../shared/config"));
const db_1 = __importDefault(require("../data/db"));
exports.limitService = new limit_service_1.LimitService();
const init = () => {
    let helpLink;
    if (config_1.default.get('hostSettings:billing:enabled') &&
        config_1.default.get('hostSettings:billing:enabled') === true &&
        config_1.default.get('hostSettings:billing:url')) {
        helpLink = config_1.default.get('hostSettings:billing:url');
    }
    else {
        helpLink = 'https://ghost.org/help/';
    }
    let subscription;
    if (config_1.default.get('hostSettings:subscription')) {
        subscription = {
            startDate: config_1.default.get('hostSettings:subscription:start'),
            interval: 'month',
        };
    }
    const hostLimits = config_1.default.get('hostSettings:limits') || {};
    try {
        exports.limitService.loadLimits({
            limits: hostLimits,
            subscription,
            db: db_1.default,
            helpLink,
            errors: errors_1.default,
        });
    }
    catch (error) {
        // Do not block the boot process for an incorrect usage error
        if (error instanceof errors_1.default.IncorrectUsageError) {
            logging_1.default.warn(error);
        }
        else {
            throw error;
        }
    }
};
exports.init = init;
