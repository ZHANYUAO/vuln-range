"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineService = defineService;
const errors_1 = require("@tryghost/errors");
function defineService(name, create, extras) {
    let instance;
    let initialization;
    async function createService() {
        instance = await create();
    }
    const root = {
        init() {
            initialization ??= createService().catch((error) => {
                initialization = undefined;
                throw error;
            });
            return initialization;
        },
        get service() {
            if (instance === undefined) {
                throw new errors_1.IncorrectUsageError({
                    message: `${name} used before init(). Call init() from boot first.`,
                });
            }
            return instance;
        },
    };
    return extras === undefined ? root : Object.assign(root, { extras });
}
