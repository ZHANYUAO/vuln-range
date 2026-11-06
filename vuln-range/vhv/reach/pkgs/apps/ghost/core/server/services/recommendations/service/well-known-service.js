"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WellknownService = void 0;
class WellknownService {
    urlUtils;
    constructor({ urlUtils }) {
        this.urlUtils = urlUtils;
    }
    #formatRecommendation(recommendation) {
        return {
            url: recommendation.url.toString(),
            updated_at: (recommendation.updatedAt ?? recommendation.createdAt).toISOString(),
            created_at: recommendation.createdAt.toISOString(),
        };
    }
    format(recommendations) {
        return recommendations.map((r) => this.#formatRecommendation(r));
    }
    getURL() {
        return new URL(this.urlUtils.relativeToAbsolute('/.well-known/recommendations.json'));
    }
}
exports.WellknownService = WellknownService;
