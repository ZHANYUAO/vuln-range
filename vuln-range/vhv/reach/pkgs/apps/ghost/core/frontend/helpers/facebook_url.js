"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.facebook_url = facebook_url;
// # Facebook URL Helper
// Usage: `{{facebook_url}}` or `{{facebook_url author.facebook}}`
//
// Output a url for a facebook username
// @ts-expect-error JavaScript module has no type declarations.
const proxy_1 = require("../services/proxy");
// @ts-expect-error JavaScript module has no type declarations.
const handlebars_1 = require("../services/handlebars");
function isFacebookUrlOptions(value) {
    return typeof value === 'object' && value !== null && 'data' in value;
}
// We use the name facebook_url to match the helper for consistency:
/**
 * @deprecated Use {{social_url type="facebook"}} instead.
 */
// eslint-disable-next-line camelcase
function facebook_url(usernameOrOptions, options) {
    let username;
    if (!options) {
        if (!isFacebookUrlOptions(usernameOrOptions)) {
            return null;
        }
        options = usernameOrOptions;
        username = handlebars_1.localUtils.findKey('facebook', this, options.data.site);
    }
    else if (typeof usernameOrOptions === 'string') {
        username = usernameOrOptions;
    }
    if (username) {
        return proxy_1.socialUrls.facebook(username);
    }
    return null;
}
