/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
export declare const pmComponents: {
    readonly schemas: {
        readonly PMPluginListSummaryItem: {
            readonly type: "object";
            readonly description: "Compact plugin row returned when listing with `mode=summary`.";
            readonly properties: {
                readonly displayName: {
                    readonly type: "string";
                };
                readonly packageName: {
                    readonly type: "string";
                };
                readonly enabled: {
                    readonly type: "boolean";
                };
                readonly description: {
                    readonly type: "string";
                };
            };
            readonly additionalProperties: true;
        };
        readonly PMPlugin: {
            readonly type: "object";
            readonly properties: {
                readonly id: {
                    readonly type: "integer";
                };
                readonly name: {
                    readonly type: "string";
                    readonly description: "Plugin short name.";
                };
                readonly packageName: {
                    readonly type: "string";
                    readonly description: "Plugin package name.";
                };
                readonly version: {
                    readonly type: "string";
                };
                readonly enabled: {
                    readonly type: "boolean";
                };
                readonly installed: {
                    readonly type: "boolean";
                };
                readonly builtIn: {
                    readonly type: "boolean";
                };
                readonly options: {
                    readonly type: "object";
                    readonly additionalProperties: true;
                };
            };
            readonly additionalProperties: true;
        };
        readonly PMEnabledPlugin: {
            readonly type: "object";
            readonly properties: {
                readonly name: {
                    readonly type: "string";
                };
                readonly packageName: {
                    readonly type: "string";
                };
                readonly options: {
                    readonly type: "object";
                    readonly additionalProperties: true;
                };
                readonly url: {
                    readonly type: "string";
                    readonly description: "Resolved client bundle URL.";
                };
            };
            readonly additionalProperties: true;
        };
        readonly PMPluginActionResult: {
            readonly type: "string";
            readonly description: "Queued successfully.";
            readonly example: "ok";
        };
        readonly PMInstallOrUpdatePayload: {
            readonly type: "object";
            readonly description: "JSON payload for installing or updating a plugin from npm or a compressed package URL.";
            readonly properties: {
                readonly packageName: {
                    readonly type: "string";
                    readonly description: "Plugin package name.";
                };
                readonly version: {
                    readonly type: "string";
                    readonly description: "Target plugin version.";
                };
                readonly registry: {
                    readonly type: "string";
                    readonly description: "Custom npm registry URL.";
                };
                readonly authToken: {
                    readonly type: "string";
                    readonly description: "Authentication token used when accessing a private registry.";
                };
                readonly compressedFileUrl: {
                    readonly type: "string";
                    readonly description: "Remote compressed package URL.";
                };
            };
            readonly additionalProperties: true;
        };
        readonly PMUploadPayload: {
            readonly type: "object";
            readonly description: "Multipart payload for uploading a plugin package file.";
            readonly properties: {
                readonly packageName: {
                    readonly type: "string";
                    readonly description: "Plugin package name. Required when updating from an uploaded file.";
                };
                readonly version: {
                    readonly type: "string";
                };
                readonly registry: {
                    readonly type: "string";
                };
                readonly authToken: {
                    readonly type: "string";
                };
                readonly file: {
                    readonly type: "string";
                    readonly format: "binary";
                    readonly description: "Compressed plugin package file.";
                };
            };
            readonly additionalProperties: true;
        };
    };
};
declare const _default: {
    readonly '/pm:list': {
        readonly get: {
            readonly tags: readonly ["pm"];
            readonly summary: "List available plugins";
            readonly description: "Return plugin metadata from the plugin manager. Pass `mode=summary` for a lightweight list built from discovered packages; omit `mode` for full records (locale-aware via the nocobase plugin).";
            readonly parameters: readonly [{
                name: string;
                in: string;
                required: boolean;
                description: string;
                schema: {
                    type: string;
                    enum: string[];
                };
            }];
            readonly responses: {
                readonly 200: {
                    description: string;
                    content: {
                        'application/json': {
                            schema: {
                                oneOf: {
                                    type: string;
                                    items: {
                                        $ref: string;
                                    };
                                }[];
                            };
                        };
                    };
                };
            };
        };
    };
    readonly '/pm:get': {
        readonly get: {
            readonly tags: readonly ["pm"];
            readonly summary: "Get plugin details";
            readonly description: "Return metadata for a single plugin.";
            readonly parameters: readonly [{
                name: string;
                in: string;
                description: string;
                required: boolean;
                schema: {
                    type: string;
                };
            }];
            readonly responses: {
                readonly 200: {
                    readonly description: "OK";
                    readonly content: {
                        readonly 'application/json': {
                            readonly schema: {
                                readonly $ref: "#/components/schemas/PMPlugin";
                            };
                        };
                    };
                };
            };
        };
    };
    readonly '/pm:listEnabled': {
        readonly get: {
            readonly tags: readonly ["pm"];
            readonly summary: "List enabled client plugins";
            readonly description: "Return enabled plugins that expose a `dist/client/index.js` entry.";
            readonly parameters: readonly [];
            readonly responses: {
                readonly 200: {
                    description: string;
                    content: {
                        'application/json': {
                            schema: {
                                type: string;
                                items: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
    };
    readonly '/pm:listEnabledV2': {
        readonly get: {
            readonly tags: readonly ["pm"];
            readonly summary: "List enabled client-v2 plugins";
            readonly description: "Return enabled plugins that expose a `dist/client-v2/index.js` entry.";
            readonly parameters: readonly [];
            readonly responses: {
                readonly 200: {
                    description: string;
                    content: {
                        'application/json': {
                            schema: {
                                type: string;
                                items: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
    };
    readonly '/pm:add': {
        readonly post: {
            readonly tags: readonly ["pm"];
            readonly summary: "Install a plugin";
            readonly description: "Queue a plugin installation from npm, a remote compressed package URL, or an uploaded package file.";
            readonly requestBody: {
                readonly required: true;
                readonly content: {
                    readonly 'application/json': {
                        readonly schema: {
                            readonly $ref: "#/components/schemas/PMInstallOrUpdatePayload";
                        };
                    };
                    readonly 'multipart/form-data': {
                        readonly schema: {
                            readonly $ref: "#/components/schemas/PMUploadPayload";
                        };
                    };
                };
            };
            readonly responses: {
                readonly 200: {
                    description: string;
                    content: {
                        'application/json': {
                            schema: {
                                oneOf: ({
                                    type: string;
                                    example: string;
                                    $ref?: undefined;
                                } | {
                                    $ref: string;
                                    type?: undefined;
                                    example?: undefined;
                                })[];
                            };
                        };
                    };
                };
            };
        };
    };
    readonly '/pm:update': {
        readonly post: {
            readonly tags: readonly ["pm"];
            readonly summary: "Update a plugin";
            readonly description: "Queue a plugin update from npm, a remote compressed package URL, or an uploaded package file.";
            readonly requestBody: {
                readonly required: true;
                readonly content: {
                    readonly 'application/json': {
                        readonly schema: {
                            readonly $ref: "#/components/schemas/PMInstallOrUpdatePayload";
                        };
                    };
                    readonly 'multipart/form-data': {
                        readonly schema: {
                            readonly $ref: "#/components/schemas/PMUploadPayload";
                        };
                    };
                };
            };
            readonly responses: {
                readonly 200: {
                    description: string;
                    content: {
                        'application/json': {
                            schema: {
                                oneOf: ({
                                    type: string;
                                    example: string;
                                    $ref?: undefined;
                                } | {
                                    $ref: string;
                                    type?: undefined;
                                    example?: undefined;
                                })[];
                            };
                        };
                    };
                };
            };
        };
    };
    readonly '/pm:enable': {
        readonly post: {
            readonly tags: readonly ["pm"];
            readonly summary: "Enable a plugin";
            readonly description: "Run plugin enable via the plugin manager. Use `awaitResponse=true` to wait for completion. Multiple plugins can be passed in `filterByTk` as a comma-separated list.";
            readonly parameters: readonly [{
                name: string;
                in: string;
                required: boolean;
                description: string;
                schema: {
                    type: string;
                };
            }, {
                name: string;
                in: string;
                required: boolean;
                description: string;
                schema: {
                    type: string;
                    default: boolean;
                };
            }];
            readonly responses: {
                readonly 200: {
                    description: string;
                    content: {
                        'application/json': {
                            schema: {
                                oneOf: ({
                                    type: string;
                                    example: string;
                                    $ref?: undefined;
                                } | {
                                    $ref: string;
                                    type?: undefined;
                                    example?: undefined;
                                })[];
                            };
                        };
                    };
                };
            };
        };
    };
    readonly '/pm:disable': {
        readonly post: {
            readonly tags: readonly ["pm"];
            readonly summary: "Disable a plugin";
            readonly description: "Run plugin disable via the plugin manager. Use `awaitResponse=true` to wait for completion. Multiple plugins can be passed in `filterByTk` as a comma-separated list.";
            readonly parameters: readonly [{
                name: string;
                in: string;
                required: boolean;
                description: string;
                schema: {
                    type: string;
                };
            }, {
                name: string;
                in: string;
                required: boolean;
                description: string;
                schema: {
                    type: string;
                    default: boolean;
                };
            }];
            readonly responses: {
                readonly 200: {
                    description: string;
                    content: {
                        'application/json': {
                            schema: {
                                oneOf: ({
                                    type: string;
                                    example: string;
                                    $ref?: undefined;
                                } | {
                                    $ref: string;
                                    type?: undefined;
                                    example?: undefined;
                                })[];
                            };
                        };
                    };
                };
            };
        };
    };
    readonly '/pm:remove': {
        readonly post: {
            readonly tags: readonly ["pm"];
            readonly summary: "Remove a plugin";
            readonly description: "Queue a removal operation for a plugin.";
            readonly parameters: readonly [{
                name: string;
                in: string;
                description: string;
                required: boolean;
                schema: {
                    type: string;
                };
            }];
            readonly responses: {
                readonly 200: {
                    description: string;
                    content: {
                        'application/json': {
                            schema: {
                                oneOf: ({
                                    type: string;
                                    example: string;
                                    $ref?: undefined;
                                } | {
                                    $ref: string;
                                    type?: undefined;
                                    example?: undefined;
                                })[];
                            };
                        };
                    };
                };
            };
        };
    };
};
export default _default;
