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
exports.forPost = void 0;
// @ts-expect-error This module lacks type definitions.
const html_to_plaintext_1 = __importDefault(require("@tryghost/html-to-plaintext"));
// @ts-expect-error This module lacks type definitions.
const localUtils = __importStar(require("../../../index"));
const TRANSISTOR_PLACEHOLDER = '<figure class="kg-card kg-transistor-card"><div class="kg-transistor-placeholder"><div class="kg-transistor-icon"><svg viewBox="5 0.5 144 144" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor"><path d="M77 120.3c-2.6 0-4.8-2.1-4.8-4.8V29.4c0-2.6 2.1-4.8 4.8-4.8s4.8 2.1 4.8 4.8v86.2c0 2.6-2.2 4.7-4.8 4.7z"/><path d="M57 77.3H34c-2.6 0-4.8-2.1-4.8-4.8 0-2.6 2.1-4.8 4.8-4.8h23c2.6 0 4.8 2.1 4.8 4.8 0 2.6-2.1 4.8-4.8 4.8z"/><path d="M120.1 77.3h-23c-2.6 0-4.8-2.1-4.8-4.8 0-2.6 2.1-4.8 4.8-4.8h23c2.6 0 4.8 2.1 4.8 4.8 0 2.6-2.2 4.8-4.8 4.8z"/><path d="M77 144.5c-39.7 0-72-32.3-72-72s32.3-72 72-72 72 32.3 72 72-32.3 72-72 72zM77 10c-34.4 0-62.4 28-62.4 62.4 0 34.4 28 62.4 62.4 62.4 34.4 0 62.4-28 62.4-62.4C139.4 38 111.4 10 77 10z"/></g></svg></div><div class="kg-transistor-content"><div class="kg-transistor-title">Members-only podcasts</div><div class="kg-transistor-description">Your Transistor podcasts will appear here. Members will see subscribe links based on their access level.</div></div></div></figure>';
const forPost = (attrs, frame) => {
    if (!localUtils.isPreview(frame)) {
        return attrs;
    }
    if (attrs.html && attrs.html.includes('data-kg-transistor-embed')) {
        attrs.html = attrs.html.replace(/<iframe[^>]*data-kg-transistor-embed[^>]*>\s*<\/iframe>\s*<script[^>]*>[\s\S]*?<\/script>\s*(?:<noscript>[\s\S]*?<\/noscript>)?/gi, TRANSISTOR_PLACEHOLDER);
        if (Object.hasOwn(attrs, 'plaintext')) {
            attrs.plaintext = html_to_plaintext_1.default.excerpt(attrs.html);
        }
        if (!attrs.custom_excerpt && Object.hasOwn(attrs, 'excerpt')) {
            const plaintext = attrs.plaintext || html_to_plaintext_1.default.excerpt(attrs.html);
            attrs.excerpt = plaintext.substring(0, 500);
        }
    }
    return attrs;
};
exports.forPost = forPost;
