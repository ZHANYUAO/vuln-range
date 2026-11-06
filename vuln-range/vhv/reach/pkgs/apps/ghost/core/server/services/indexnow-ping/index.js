"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const define_service_1 = require("../../../kernel/define-service");
const indexnow_ping_service_1 = require("./indexnow-ping-service");
exports.default = (0, define_service_1.defineService)('IndexNow', () => {
    const service = new indexnow_ping_service_1.IndexNowPingService({
        settingsCache: require('../../../shared/settings-cache'),
        config: require('../../../shared/config'),
        urlService: require('../url'),
        urlUtils: require('../../../shared/url-utils').default,
        request: require('@tryghost/request'),
        logging: require('@tryghost/logging'),
        events: require('../../lib/common/events'),
    });
    try {
        service.subscribeEvents();
    }
    catch (error) {
        service.unsubscribeEvents();
        throw error;
    }
    return service;
});
