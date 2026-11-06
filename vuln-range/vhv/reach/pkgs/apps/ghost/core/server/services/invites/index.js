"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const define_service_1 = require("../../../kernel/define-service");
const invites_1 = require("./invites");
exports.default = (0, define_service_1.defineService)('Invites', () => {
    const settingsCache = require('../../../shared/settings-cache');
    const settingsHelpers = require('../settings-helpers');
    const mailService = require('../../lib/mail');
    const urlUtils = require('../../../shared/url-utils').default;
    const models = require('../../models');
    const logging = require('@tryghost/logging');
    return new invites_1.Invites({
        settingsCache,
        settingsHelpers,
        mailService,
        urlUtils,
        models,
        logging,
    });
});
