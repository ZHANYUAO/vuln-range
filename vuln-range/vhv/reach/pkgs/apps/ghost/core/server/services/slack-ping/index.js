"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const define_service_1 = require("../../../kernel/define-service");
const slack_ping_service_1 = require("./slack-ping-service");
exports.default = (0, define_service_1.defineService)('Slack ping', () => {
    const service = new slack_ping_service_1.SlackPingService({
        blogIcon: require('../../lib/image').blogIcon,
        events: require('../../lib/common/events'),
        logging: require('@tryghost/logging'),
        request: require('../../lib/request-external'),
        settingsCache: require('../../../shared/settings-cache'),
        urlService: require('../url'),
        urlUtils: require('../../../shared/url-utils').default,
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
