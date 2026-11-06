"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const serializers_1 = require("../../../../../services/app-installations/serializers");
const serializeOne = (installation, _apiConfig, frame) => {
    frame.response = serializers_1.toAppInstallationsResponse.parse([installation]);
};
// module.exports (not export): the API framework loads serializers via require(). The endpoint ->
// serializer mapping lives here; the response shaping lives with the app installations service.
module.exports = {
    browse(installations, _apiConfig, frame) {
        frame.response = serializers_1.toAppInstallationsResponse.parse(installations);
    },
    read: serializeOne,
    add: serializeOne,
    edit: serializeOne,
};
