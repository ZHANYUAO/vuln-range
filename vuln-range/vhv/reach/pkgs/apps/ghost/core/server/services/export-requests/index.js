"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const define_service_1 = require("../../../kernel/define-service");
const export_requests_service_1 = require("./export-requests-service");
exports.default = (0, define_service_1.defineService)('Export Requests', () => {
    const config = require('../../../shared/config');
    const logging = require('@tryghost/logging');
    const request = require('@tryghost/request');
    return new export_requests_service_1.ExportRequestsService({ config, logging, request });
});
