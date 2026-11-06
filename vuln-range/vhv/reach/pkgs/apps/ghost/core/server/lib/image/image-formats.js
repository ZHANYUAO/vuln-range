"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImageFormat = getImageFormat;
exports.getImageLoader = getImageLoader;
const IMAGE_FORMATS = {
    jpeg: { extensions: ['.jpg', '.jpeg', '.jpe', '.jfif'], loader: 'VipsForeignLoadJpeg' },
    // file-type reports animated PNGs as .apng; they decode as PNG
    png: { extensions: ['.png', '.apng'], loader: 'VipsForeignLoadPng' },
    gif: { extensions: ['.gif'], loader: 'VipsForeignLoadNsgif' },
    webp: { extensions: ['.webp'], loader: 'VipsForeignLoadWebp' },
    svg: { extensions: ['.svg', '.svgz'], loader: 'VipsForeignLoadSvg' },
    avif: { extensions: ['.avif'], loader: 'VipsForeignLoadHeif' },
    // file-type reports both .heic and .heif files as .heic
    heic: { extensions: ['.heic', '.heif'], loader: 'VipsForeignLoadHeif' },
    tiff: { extensions: ['.tif', '.tiff'], loader: 'VipsForeignLoadTiff' },
    // No libvips loader, so .ico files can be stored but never processed
    ico: { extensions: ['.ico'] },
};
const FORMAT_BY_EXTENSION = new Map(Object.entries(IMAGE_FORMATS).flatMap(([name, format]) => format.extensions.map((ext) => [ext, name])));
/**
 * @returns the format name for an extension (including the leading dot), or
 * undefined when it isn't a known image format
 */
function getImageFormat(ext) {
    return FORMAT_BY_EXTENSION.get(ext.toLowerCase());
}
/**
 * @returns the libvips loader for an extension, or undefined when there is none
 */
function getImageLoader(ext) {
    const format = getImageFormat(ext);
    return format ? IMAGE_FORMATS[format].loader : undefined;
}
