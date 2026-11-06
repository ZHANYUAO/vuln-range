"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const define_service_1 = require("../../../kernel/define-service");
exports.default = (0, define_service_1.defineService)('Integrations', () => {
    const models = require('../../models');
    const createIntegrationsService = require('./integrations-service');
    return createIntegrationsService({
        IntegrationModel: models.Integration,
        ApiKeyModel: models.ApiKey,
    });
});
