"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const serializers_1 = require("../../../../../services/stripe-checkout-config/serializers");
const serialize = (preview, _apiConfig, frame) => {
    frame.response = serializers_1.toCheckoutPreviewResponse.parse(preview);
};
// module.exports (not export): the API framework loads serializers via require().
module.exports = {
    add: serialize,
};
