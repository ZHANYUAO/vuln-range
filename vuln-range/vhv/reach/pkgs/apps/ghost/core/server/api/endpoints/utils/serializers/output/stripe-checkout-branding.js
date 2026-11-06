"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const serializers_1 = require("../../../../../services/stripe-checkout-config/serializers");
const serialize = (branding, _apiConfig, frame) => {
    frame.response = serializers_1.toCheckoutBrandingResponse.parse(branding);
};
// module.exports (not export): the API framework loads serializers via require().
module.exports = {
    read: serialize,
};
