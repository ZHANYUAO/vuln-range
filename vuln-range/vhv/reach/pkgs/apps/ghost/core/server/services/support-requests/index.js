"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const define_service_1 = require("../../../kernel/define-service");
const support_requests_service_1 = require("./support-requests-service");
exports.default = (0, define_service_1.defineService)('Support Requests', () => {
    const config = require('../../../shared/config');
    const logging = require('@tryghost/logging');
    const request = require('@tryghost/request');
    return new support_requests_service_1.SupportRequestsService({ config, logging, request });
});
