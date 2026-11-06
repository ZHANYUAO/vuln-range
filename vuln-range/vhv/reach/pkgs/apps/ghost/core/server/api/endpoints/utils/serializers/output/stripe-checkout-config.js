"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const models_1 = require("../../../../../services/stripe-checkout-config/models");
const serializers_1 = require("../../../../../services/stripe-checkout-config/serializers");
const labs = require('../../../../../../shared/labs');
const serialize = (config, _apiConfig, frame) => {
    // The collected parts are still in development, so staff only see them while their flag is on.
    frame.response = serializers_1.toCheckoutConfigResponse.parse(labs.isSet(models_1.COLLECTION_FLAG) ? config : { design: config.design });
};
// module.exports (not export): the API framework loads serializers via require().
module.exports = {
    read: serialize,
    edit: serialize,
};
