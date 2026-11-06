"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OembedData = void 0;
const zod_1 = require("zod");
// providers send dimensions as numbers, numeric strings, "100%", or null
const Dimension = zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).nullish();
// Loose on purpose: providers omit spec fields and card consumers read extra ones
exports.OembedData = zod_1.z.looseObject({
    type: zod_1.z.string().optional(),
    version: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).nullish(),
    title: zod_1.z.string().nullish(),
    html: zod_1.z.string().nullish(),
    url: zod_1.z.string().nullish(),
    width: Dimension,
    height: Dimension,
    author_name: zod_1.z.string().nullish(),
    author_url: zod_1.z.string().nullish(),
    provider_name: zod_1.z.string().nullish(),
    provider_url: zod_1.z.string().nullish(),
    thumbnail_url: zod_1.z.string().nullish(),
    thumbnail_width: Dimension,
    thumbnail_height: Dimension,
});
