"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logging_1 = __importDefault(require("@tryghost/logging"));
const define_service_1 = require("../../../kernel/define-service");
const service_1 = require("./service");
const actions_1 = require("./actions");
// Constructed by init() at boot, not at import: knex is only available once the DB has connected.
exports.default = (0, define_service_1.defineService)('Gift Links', () => {
    const { knex } = require('../../data/db');
    const models = require('../../models');
    const recordAction = ({ context, verb, subject }) => (0, actions_1.recordGiftLinkAction)({ Action: models.Action, logging: logging_1.default, context, verb, subject });
    return new service_1.GiftLinksService({ knex, recordAction });
});
