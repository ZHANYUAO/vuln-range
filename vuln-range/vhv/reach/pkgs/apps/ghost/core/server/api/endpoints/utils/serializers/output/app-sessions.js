"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const serializers_1 = require("../../../../../services/app-installations/serializers");
// module.exports (not export): the API framework loads serializers via require().
module.exports = {
    start(session, _apiConfig, frame) {
        frame.response = serializers_1.toAppSessionsResponse.parse(session);
    },
};
