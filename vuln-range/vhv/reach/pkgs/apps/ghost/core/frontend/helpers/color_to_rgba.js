"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.color_to_rgba = color_to_rgba;
const color_utils_1 = require("@tryghost/color-utils");
// eslint-disable-next-line camelcase
function color_to_rgba(color, alpha) {
    const backgroundColor = typeof color === 'string' && color.trim() ? color.trim() : '#15171A';
    const opacity = typeof alpha === 'number' && Number.isFinite(alpha) ? alpha : Number.parseFloat(String(alpha));
    const normalizedOpacity = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0.25;
    try {
        return new color_utils_1.Color(backgroundColor).alpha(normalizedOpacity).rgb().string();
    }
    catch {
        return 'rgba(21, 23, 26, 0.25)';
    }
}
