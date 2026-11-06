"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const define_service_1 = require("../../../kernel/define-service");
const CustomThemeSettingsService = require('./custom-theme-settings-service');
exports.default = (0, define_service_1.defineService)('Custom theme settings', () => {
    return new CustomThemeSettingsService({
        model: require('../../models').CustomThemeSetting,
        cache: require('../../../shared/custom-theme-settings-cache'),
    });
});
