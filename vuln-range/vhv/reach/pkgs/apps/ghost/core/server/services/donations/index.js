"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const define_service_1 = require("../../../kernel/define-service");
const donation_bookshelf_repository_1 = require("./donation-bookshelf-repository");
exports.default = (0, define_service_1.defineService)('Donations', () => {
    const { DonationPaymentEvent: DonationPaymentEventModel } = require('../../models');
    return new donation_bookshelf_repository_1.DonationBookshelfRepository({ DonationPaymentEventModel });
});
