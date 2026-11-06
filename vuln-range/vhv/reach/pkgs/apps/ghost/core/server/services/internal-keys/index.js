"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const define_service_1 = require("../../../kernel/define-service");
const auto_filling_map_1 = require("../../lib/auto-filling-map");
// Each internal integration is seeded with a single API key whose type is
// fixed by fixtures. Encoded here so callers don't have to know.
const SLUG_KEY_TYPE = {
    'ghost-scheduler': 'admin',
    'ghost-internal-frontend': 'content',
};
exports.default = (0, define_service_1.defineService)('Internal Keys', () => {
    // The Bookshelf registry has no TypeScript declarations. Keep its typed
    // boundary and acquisition here; constructing the map does not query keys.
    const models = require('../../models');
    return new auto_filling_map_1.AutoFillingMap((slug) => models.Integration.getApiKeyBySlug(slug, SLUG_KEY_TYPE[slug]));
});
