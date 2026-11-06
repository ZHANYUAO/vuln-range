"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const define_service_1 = require("../../../kernel/define-service");
const url_utils_1 = __importDefault(require("../../../shared/url-utils"));
const urlService = require('../url');
const permissions = require('../permissions');
const AudienceFeedbackService = require('./audience-feedback-service');
const AudienceFeedbackController = require('./audience-feedback-controller');
const Feedback = require('./feedback');
const FeedbackRepository = require('./feedback-repository');
exports.default = (0, define_service_1.defineService)('Audience Feedback', () => {
    const models = require('../../models');
    const repository = new FeedbackRepository({
        Member: models.Member,
        MemberFeedback: models.MemberFeedback,
        Feedback,
        Post: models.Post,
    });
    const service = new AudienceFeedbackService({
        urlService,
        config: {
            baseURL: new URL(url_utils_1.default.urlFor('home', true)),
        },
    });
    const controller = new AudienceFeedbackController({
        repository,
        audienceFeedbackService: service,
        permissions,
    });
    return { repository, service, controller };
});
