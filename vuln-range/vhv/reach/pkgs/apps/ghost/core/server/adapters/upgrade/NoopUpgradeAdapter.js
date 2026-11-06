"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const adapter_base_upgrade_1 = require("@tryghost/adapter-base-upgrade");
/** The default: Ghost never upgrades itself, so updates stay unavailable until a host adapter is configured. */
class NoopUpgradeAdapter extends adapter_base_upgrade_1.UpgradeBase {
    async getStatus() {
        return { supported: false, reason: 'not-configured' };
    }
    async createRequest() {
        throw new adapter_base_upgrade_1.UpgradeAdapterError({ code: 'unsupported' });
    }
    async getJob(id) {
        return { id, state: 'unknown' };
    }
}
exports.default = NoopUpgradeAdapter;
