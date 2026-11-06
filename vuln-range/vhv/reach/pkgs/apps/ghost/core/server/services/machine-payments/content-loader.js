"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentLoader = void 0;
const eligibility_1 = require("./eligibility");
/**
 * Loads full post/page HTML only after payment has been verified.
 * Bypasses Content API member gating intentionally — this is the privileged
 * unlock path for machine payments, not a membership grant.
 */
class ContentLoader {
    _postModel;
    urlService;
    constructor({ postModel, urlServiceFacade } = {}) {
        this._postModel = postModel;
        this.urlService = urlServiceFacade;
    }
    get postModel() {
        if (!this._postModel) {
            this._postModel = require('../../models').Post;
        }
        return this._postModel;
    }
    /**
     * Raw-model eligibility check. Use this before issuing a 402 so Content API
     * tier stripping cannot mark a mixed free+paid post as purchasable.
     * Includes the same URL deliverability gate as loadFullEntry so we never
     * challenge/charge for content we cannot serve.
     */
    async isPurchasable(resourceType, id) {
        const model = await this.#findPublished(resourceType, id, ['tiers']);
        if (!model) {
            return false;
        }
        const entry = model.toJSON();
        if (!(0, eligibility_1.isPurchasableEntry)(entry)) {
            return false;
        }
        return this.#hasDeliverableUrl(entry, resourceType);
    }
    async loadFullEntry(resourceType, id) {
        const type = resourceType === 'pages' ? 'page' : 'post';
        const model = await this.#findPublished(resourceType, id, ['authors', 'tags', 'tiers']);
        if (!model) {
            return null;
        }
        const entry = model.toJSON();
        if (!(0, eligibility_1.isPurchasableEntry)(entry)) {
            return null;
        }
        entry.type = type;
        const url = this.#resolveAbsoluteUrl(entry, resourceType);
        if (url === null) {
            return null;
        }
        if (url !== undefined) {
            entry.url = url;
        }
        return entry;
    }
    /**
     * @returns `undefined` when no url service is configured, `null` when the
     * resource is not deliverable, otherwise the absolute URL.
     */
    #resolveAbsoluteUrl(entry, resourceType) {
        if (!this.urlService) {
            return undefined;
        }
        const url = this.urlService.getUrlForResource({
            ...entry,
            type: resourceType === 'pages' ? 'pages' : 'posts',
        }, { absolute: true });
        if (!url || String(url).endsWith('/404/')) {
            return null;
        }
        return url;
    }
    #hasDeliverableUrl(entry, resourceType) {
        return this.#resolveAbsoluteUrl(entry, resourceType) !== null;
    }
    async #findPublished(resourceType, id, withRelated) {
        const type = resourceType === 'pages' ? 'page' : 'post';
        return await this.postModel.findOne({
            id,
            type,
            status: 'published',
        }, { withRelated });
    }
}
exports.ContentLoader = ContentLoader;
