"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WellknownController = void 0;
class WellknownController {
    service;
    constructor(deps) {
        this.service = deps.service;
    }
    async getRecommendations(req, res, next) {
        try {
            const recommendations = await this.service.getWellknownRecommendations();
            res.set('Cache-Control', 'public, max-age=0');
            res.json(recommendations);
        }
        catch (err) {
            next(err);
        }
    }
}
exports.WellknownController = WellknownController;
