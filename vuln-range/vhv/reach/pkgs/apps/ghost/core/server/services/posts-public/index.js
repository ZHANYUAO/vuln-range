"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const define_service_1 = require("../../../kernel/define-service");
exports.default = (0, define_service_1.defineService)('Posts Public', () => {
    const adapterManager = require('../adapter-manager').default;
    const config = require('../../../shared/config');
    const events = require('../../lib/common/events');
    const cacheEnabled = zod_1.z.coerce
        .boolean()
        .parse(config.get('hostSettings:postsPublicCache:enabled'));
    const cache = cacheEnabled
        ? adapterManager.getAdapter('cache:postsPublic')
        : undefined;
    if (cache) {
        events.on('site.changed', () => {
            cache.reset();
        });
    }
    return { cache };
});
