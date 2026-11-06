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
exports.finalize = void 0;
const cheerio = __importStar(require("cheerio/slim"));
const juice_1 = __importDefault(require("juice"));
// @ts-expect-error This module currently lacks type definitions.
const html_to_plaintext_1 = __importDefault(require("@tryghost/html-to-plaintext"));
const finalizeHtml = (html) => {
    // Add a class to each figcaption so we can style them in the email.
    let $ = cheerio.load(html, null, false);
    $('figcaption').addClass('kg-card-figcaption');
    html = $.html();
    // resolveCSSVariables crashes on nameless declarations in user-authored style attributes
    const juicedHtml = (0, juice_1.default)(html, {
        inlinePseudoElements: true,
        removeStyleTags: true,
        resolveCSSVariables: false,
    });
    // Many email clients, like Outlook and Yahoo, [lack support for <figure>
    // and <figcaption>][0]. To work around this, change the tags to <div>s.
    // Juice should have properly styled them.
    //
    // [0]: https://www.caniemail.com/features/html-semantics/
    $ = cheerio.load(juicedHtml, null, false);
    $('figure, figcaption').each((_, el) => {
        el.tagName = 'div';
    });
    // Fix characters unsupported in some Outlook versions.
    html = $.html();
    html = html.replace(/&apos;/g, '&#39;');
    html = html.replace(/→/g, '&rarr;');
    html = html.replace(/–/g, '&ndash;');
    html = html.replace(/“/g, '&ldquo;');
    html = html.replace(/”/g, '&rdquo;');
    return html;
};
const finalize = (html) => {
    const resultHtml = finalizeHtml(html);
    return { html: resultHtml, plaintext: html_to_plaintext_1.default.email(resultHtml) };
};
exports.finalize = finalize;
