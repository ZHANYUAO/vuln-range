"use strict";
// Image processing picks its decoder from a file's contents rather than its
// name, so anything that stores an image or hands it to image processing must
// check what the contents actually are. These helpers hold the contents to the
// configured `uploads.images.extensions`-style allowlists.
//
// `file-type` can't detect SVG (it's text), so SVGs never pass the content
// check. Callers route SVG files to the SVG sanitizer instead.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMAGE_UPLOAD_TYPES = void 0;
exports.isSvgExtension = isSvgExtension;
exports.detectFileExtension = detectFileExtension;
exports.isAllowedImageExtension = isAllowedImageExtension;
exports.isAllowedImageContent = isAllowedImageContent;
exports.isImageContentType = isImageContentType;
exports.getIgnoredImageContentTypes = getIgnoredImageContentTypes;
const image_formats_1 = require("./image-formats");
function isSvgExtension(ext) {
    return (0, image_formats_1.getImageFormat)(ext) === 'svg';
}
async function detectFileType(input) {
    // file-type is ESM-only. tsc emits this as `require('file-type')` under
    // module: commonjs, which resolves via Node's require(esm).
    const { fileTypeFromBuffer, fileTypeFromFile } = await Promise.resolve().then(() => __importStar(require('file-type')));
    return typeof input === 'string' ? fileTypeFromFile(input) : fileTypeFromBuffer(input);
}
/**
 * Detects a file's type from its contents.
 *
 * @returns the detected extension including the leading dot (e.g. `.jpg`), or
 * `undefined` when the contents aren't a recognised binary format
 */
async function detectFileExtension(input) {
    const fileType = await detectFileType(input);
    return fileType ? `.${fileType.ext}` : undefined;
}
/**
 * Checks an extension against an allowlist by format, so e.g. `.tif` matches
 * a configured `.tiff` and `.jpg` matches `.jpeg`.
 */
function isAllowedImageExtension(ext, extensions) {
    if (!ext) {
        return false;
    }
    const format = (0, image_formats_1.getImageFormat)(ext);
    if (!format) {
        return extensions.some((allowed) => allowed.toLowerCase() === ext.toLowerCase());
    }
    return extensions.some((allowed) => (0, image_formats_1.getImageFormat)(allowed) === format);
}
/**
 * Checks that a file's contents are one of the allowed image formats.
 *
 * @param input a file path or the file's contents
 * @param extensions allowed extensions, including the leading dot
 */
async function isAllowedImageContent(input, extensions) {
    const fileType = await detectFileType(input);
    // A site can allow any extension, so also require the contents to be an
    // image, e.g. a PDF doesn't pass because `.pdf` was added to the list
    if (!fileType || !fileType.mime.startsWith('image/')) {
        return false;
    }
    const ext = `.${fileType.ext}`;
    // Keep SVG out even if file-type ever learns to detect it, so it can't skip
    // the sanitizer.
    return !isSvgExtension(ext) && isAllowedImageExtension(ext, extensions);
}
/**
 * Upload config keys whose files are stored as images.
 */
exports.IMAGE_UPLOAD_TYPES = ['images', 'thumbnails', 'icons'];
/**
 * Checks a content type an image upload may be stored with. Storage adapters
 * that keep the uploaded content type (e.g. S3) serve the file with it, so a
 * type such as text/html would have browsers treat an image as a page. SVGs
 * are sanitized, and application/octet-stream is served as a download.
 */
function isImageContentType(contentType) {
    const normalized = contentType.trim().toLowerCase();
    return normalized.startsWith('image/') || normalized === 'application/octet-stream';
}
/**
 * @returns the configured content types that image uploads ignore
 */
function getIgnoredImageContentTypes(contentTypes) {
    return contentTypes.filter((contentType) => !isImageContentType(contentType));
}
