/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
declare const _default: {
    readonly '/app:getLang': {
        readonly get: {
            readonly tags: readonly ["app"];
            readonly summary: "Get the current application language";
            readonly description: "Return the current locale used by the server.";
            readonly parameters: readonly [{
                readonly name: "locale";
                readonly in: "query";
                readonly required: false;
                readonly schema: {
                    readonly type: "string";
                };
                readonly description: "Requested application locale. The server validates it against enabled languages.";
            }, {
                readonly name: "ns";
                readonly in: "query";
                readonly required: false;
                readonly schema: {
                    readonly type: "string";
                };
                readonly description: "Comma-separated resource namespaces to return. Omit it to preserve the full legacy payload.";
            }];
            readonly responses: {
                readonly 200: {
                    readonly description: "OK";
                    readonly content: {
                        readonly 'application/json': {
                            readonly schema: {
                                readonly type: "string";
                            };
                        };
                    };
                };
            };
        };
    };
    readonly '/app:getInfo': {
        readonly get: {
            readonly tags: readonly ["app"];
            readonly summary: "Get application metadata";
            readonly description: "Return basic application information, including version and environment-related metadata.";
            readonly parameters: readonly [];
            readonly responses: {
                readonly 200: {
                    readonly description: "OK";
                    readonly content: {
                        readonly 'application/json': {
                            readonly schema: {
                                readonly type: "object";
                                readonly additionalProperties: true;
                            };
                        };
                    };
                };
            };
        };
    };
    readonly '/app:getPlugins': {
        readonly get: {
            readonly tags: readonly ["app"];
            readonly summary: "List loaded plugins";
            readonly description: "Return plugin metadata for the current application runtime.";
            readonly parameters: readonly [];
            readonly responses: {
                readonly 200: {
                    readonly description: "OK";
                    readonly content: {
                        readonly 'application/json': {
                            readonly schema: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                            };
                        };
                    };
                };
            };
        };
    };
    readonly '/app:restart': {
        readonly post: {
            readonly tags: readonly ["app"];
            readonly summary: "Restart the application";
            readonly description: "Trigger an application restart asynchronously.";
            readonly parameters: readonly [];
            readonly responses: {
                readonly 200: {
                    readonly description: "OK";
                };
            };
        };
    };
    readonly '/app:clearCache': {
        readonly post: {
            readonly tags: readonly ["app"];
            readonly summary: "Clear application cache";
            readonly description: "Clear server-side caches used by the current application instance.";
            readonly parameters: readonly [];
            readonly responses: {
                readonly 200: {
                    readonly description: "OK";
                };
            };
        };
    };
};
export default _default;
