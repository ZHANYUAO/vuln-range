"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = __importDefault(require("@tryghost/errors"));
const logging_1 = __importDefault(require("@tryghost/logging"));
const define_service_1 = require("../../../kernel/define-service");
const url_utils_1 = __importDefault(require("../../../shared/url-utils"));
const metafields = __importStar(require("../members-metafields"));
const actions_1 = require("./actions");
const branding_service_1 = require("./branding-service");
const checkout_service_1 = require("./checkout-service");
const preview_service_1 = require("./preview-service");
const service_1 = require("./service");
const extras = { actingContext: actions_1.actingContext };
// Constructed by init() at boot, not at import: knex is only available once the DB has
// connected.
exports.default = (0, define_service_1.defineService)('Stripe Checkout Config', () => {
    const { knex } = require('../../data/db');
    const models = require('../../models');
    const labs = require('../../../shared/labs');
    // Boot sets up the custom fields services first, as shipping saves into custom fields.
    if (!metafields.bindings || !metafields.fields) {
        throw new errors_1.default.IncorrectUsageError({
            message: 'The custom fields services must be set up before the Stripe Checkout config.',
        });
    }
    const recordAction = (input) => (0, actions_1.recordCheckoutConfigAction)({ Action: models.Action, logging: logging_1.default, ...input });
    const config = new service_1.StripeCheckoutConfigService({
        knex,
        recordAction,
        bindings: metafields.bindings,
        fields: metafields.fields,
        logging: logging_1.default,
    });
    const checkouts = new checkout_service_1.CheckoutService({ config, labs, logging: logging_1.default });
    return {
        config,
        checkouts,
        // Looked up on each use: Stripe, tiers and members are set up later in boot.
        previews: new preview_service_1.CheckoutPreviewService({
            stripeConnected: () => require('../stripe').api.configured,
            readTier: (id) => require('../tiers').api.read(id),
            checkouts,
            createPreviewLink: (params) => require('../members').api.paymentsService.getPreviewLink(params),
            siteUrl: () => url_utils_1.default.urlFor('home', true),
        }),
        branding: new branding_service_1.CheckoutBrandingService({
            stripeConnected: () => require('../stripe').api.configured,
            readBranding: () => require('../stripe').api.getCheckoutBranding(),
            logging: logging_1.default,
        }),
    };
}, extras);
