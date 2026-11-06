"use strict";
/**
 * ```
 * const { Minifier } = require('./minifier');
 * const minifier = new Minifier({
 *     src: 'my/src/path',
 *     dest: 'my/dest/path'
 * });
 *
 * minifier.minify({
 *     'some.css': '*.css',
 *     'then.js': '!(other).js'
 * });
 * ```
 *
 * - Minfier constructor requires a src and a dest
 * - minify() function takes an object with destination file as the key and source glob as the value
 *    - globs can be anything fs.glob supports
 *    - destination files must end with .css or .js
 *    - src files will be minified according to their destination file extension
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Minifier = void 0;
const errors_1 = __importDefault(require("@tryghost/errors"));
const debug_1 = __importDefault(require("@tryghost/debug"));
const tpl_1 = __importDefault(require("@tryghost/tpl"));
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const debug = (0, debug_1.default)('minifier');
const messages = {
    badDestination: {
        message: 'Unexpected destination {dest}',
        context: 'Minifier expected a destination that ended in .css or .js',
    },
    badSource: {
        message: 'Unable to read source files {src}',
        context: 'Minifier was unable to locate or read the source files',
    },
    missingConstructorOption: {
        message: 'Minifier missing {opt} option',
        context: 'new Minifier({}) requires a {opt} option',
    },
    globalHelp: 'Refer to the README for Minifier for how to use this module',
};
// public API for minify hooks
class Minifier {
    srcPath;
    destPath;
    constructor({ src, dest } = {}) {
        if (!src) {
            throw new errors_1.default.IncorrectUsageError({
                message: (0, tpl_1.default)(messages.missingConstructorOption.message, { opt: 'src' }),
                context: (0, tpl_1.default)(messages.missingConstructorOption.context, { opt: 'src' }),
                help: (0, tpl_1.default)(messages.globalHelp),
            });
        }
        if (!dest) {
            throw new errors_1.default.IncorrectUsageError({
                message: (0, tpl_1.default)(messages.missingConstructorOption.message, { opt: 'dest' }),
                context: (0, tpl_1.default)(messages.missingConstructorOption.context, { opt: 'dest' }),
                help: (0, tpl_1.default)(messages.globalHelp),
            });
        }
        this.srcPath = src;
        this.destPath = dest;
    }
    getFullSrc(src) {
        return node_path_1.default.join(this.srcPath, src);
    }
    getFullDest(dest) {
        return node_path_1.default.join(this.destPath, dest);
    }
    async minifyCSS(contents) {
        const csso = require('csso');
        const result = csso.minify(contents);
        if (result && result.css) {
            return result.css;
        }
        return null;
    }
    async minifyJS(contents) {
        const terser = require('terser');
        const result = await terser.minify(contents);
        if (result && result.code) {
            return result.code;
        }
        return null;
    }
    async getMatchingFiles(src) {
        const files = [];
        for await (const file of promises_1.default.glob(this.getFullSrc(src))) {
            files.push(file);
        }
        // Files are concatenated in this order, so keep it deterministic
        return files.sort();
    }
    async readFiles(files) {
        let mergedFiles = '';
        for (const file of files) {
            const contents = await promises_1.default.readFile(file, 'utf8');
            mergedFiles += contents;
        }
        return mergedFiles;
    }
    async getSrcFileContents(src) {
        const badSource = new errors_1.default.IncorrectUsageError({
            message: (0, tpl_1.default)(messages.badSource.message, { src }),
            context: (0, tpl_1.default)(messages.badSource.context),
            help: (0, tpl_1.default)(messages.globalHelp),
        });
        let files;
        try {
            files = await this.getMatchingFiles(src);
        }
        catch {
            throw badSource;
        }
        // fs.glob returns nothing for missing files and folders
        if (!files.length) {
            throw badSource;
        }
        try {
            return await this.readFiles(files);
        }
        catch {
            throw badSource;
        }
    }
    async writeFile(contents, dest) {
        if (contents) {
            const writePath = this.getFullDest(dest);
            // Ensure the output folder exists
            await promises_1.default.mkdir(this.destPath, { recursive: true });
            // Create the file
            await promises_1.default.writeFile(writePath, contents);
            return writePath;
        }
    }
    /**
     * Minify files
     *
     * @param globs An object in the form of
     * ```js
     * {
     *     'destination1.js': 'glob/*.js',
     *     'destination2.js': 'glob2/*.js'
     * }
     * ```
     * @returns List of minified files (keys of globs)
     */
    async minify(globs, options) {
        debug('Begin', globs);
        const destinations = Object.keys(globs);
        const minifiedFiles = [];
        for (const dest of destinations) {
            const isCSS = dest.endsWith('.css');
            if (!isCSS && !dest.endsWith('.js')) {
                throw new errors_1.default.IncorrectUsageError({
                    message: (0, tpl_1.default)(messages.badDestination.message, { dest }),
                    context: (0, tpl_1.default)(messages.badDestination.context),
                    help: (0, tpl_1.default)(messages.globalHelp),
                });
            }
            const src = globs[dest];
            let contents = await this.getSrcFileContents(src);
            if (options?.replacements) {
                for (const key of Object.keys(options.replacements)) {
                    contents = contents.replace(key, options.replacements[key]);
                }
            }
            const minifiedContents = isCSS
                ? await this.minifyCSS(contents)
                : await this.minifyJS(contents);
            const result = await this.writeFile(minifiedContents, dest);
            if (result) {
                minifiedFiles.push(dest);
            }
        }
        debug('End');
        return minifiedFiles;
    }
}
exports.Minifier = Minifier;
