"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeSvgContent = sanitizeSvgContent;
exports.sanitizeSvgBuffer = sanitizeSvgBuffer;
exports.sanitizeSvgFile = sanitizeSvgFile;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_util_1 = require("node:util");
const node_zlib_1 = __importDefault(require("node:zlib"));
const logging_1 = __importDefault(require("@tryghost/logging"));
const gunzip = (0, node_util_1.promisify)(node_zlib_1.default.gunzip);
const gzip = (0, node_util_1.promisify)(node_zlib_1.default.gzip);
/**
 * Returns sanitized SVG content, or null if the content is invalid.
 */
function sanitizeSvgContent(content) {
    // Loaded lazily: jsdom is slow to require and only needed for SVGs.
    const { JSDOM } = require('jsdom');
    const createDOMPurify = require('dompurify');
    const window = new JSDOM('').window;
    const DOMPurify = createDOMPurify(window);
    const sanitized = DOMPurify.sanitize(content, { USE_PROFILES: { svg: true, svgFilters: true } });
    // Check whether the sanitized content still contains a non-empty <svg> tag
    const validSvgTag = sanitized?.match(/<svg[^>]*>\s*[\S]+[\S\s]*<\/svg>/);
    if (!sanitized || sanitized.trim() === '' || !validSvgTag) {
        return null;
    }
    return sanitized;
}
/**
 * Sanitizes the contents of an .svg or .svgz file.
 *
 * @returns the sanitized file contents, or null if the SVG could not be sanitized
 */
async function sanitizeSvgBuffer(buffer, isZipped = false) {
    try {
        const original = isZipped ? (await gunzip(buffer)).toString() : buffer.toString('utf8');
        const sanitized = sanitizeSvgContent(original);
        if (!sanitized) {
            return null;
        }
        return isZipped ? await gzip(sanitized) : Buffer.from(sanitized);
    }
    catch (error) {
        logging_1.default.error('Error sanitizing SVG:', error);
        return null;
    }
}
/**
 * Sanitizes an .svg or .svgz file in place. Only files in the temp directory,
 * where uploads and extracted imports are written, can be rewritten.
 *
 * @returns whether the SVG could be sanitized
 */
async function sanitizeSvgFile(filepath, isZipped = false) {
    const resolvedPath = node_path_1.default.resolve(filepath);
    if (!resolvedPath.startsWith(node_path_1.default.resolve(node_os_1.default.tmpdir()) + node_path_1.default.sep)) {
        logging_1.default.error(`Refused to sanitize SVG outside the temp directory: ${filepath}`);
        return false;
    }
    try {
        const sanitized = await sanitizeSvgBuffer(await promises_1.default.readFile(resolvedPath), isZipped);
        if (!sanitized) {
            return false;
        }
        await promises_1.default.writeFile(resolvedPath, sanitized);
        return true;
    }
    catch (error) {
        logging_1.default.error('Error sanitizing SVG:', error);
        return false;
    }
}
