/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
declare const _default: {
    tags: ({
        readonly name: "$collection";
        readonly description: "Data table";
    } | {
        readonly name: "$collection.$oneToOneAssociation";
        readonly description: "One to one relationship";
    } | {
        readonly name: "$collection.$manyToOneAssociation";
        readonly description: "Many to one relationship";
    } | {
        readonly name: "$collection.$oneToManyAssociation";
        readonly description: "One to many relationship";
    } | {
        readonly name: "$collection.$manyToManyAssociation";
        readonly description: "Many to many relationship";
    } | {
        readonly name: "app";
        readonly description: "app";
    } | {
        readonly name: "pm";
        readonly description: "pm";
    } | {
        name: string;
        description: string;
    })[];
    components: {
        schemas: {
            PMPluginListSummaryItem: {
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
            PMPlugin: {
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
            PMEnabledPlugin: {
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
            PMPluginActionResult: {
                readonly type: "string";
                readonly description: "Queued successfully.";
                readonly example: "ok";
            };
            PMInstallOrUpdatePayload: {
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
            PMUploadPayload: {
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
        parameters: {
            readonly collectionName: {
                readonly required: true;
                readonly name: "collectionName";
                readonly in: "path";
                readonly description: "Collection name";
                readonly schema: {
                    readonly type: "string";
                };
            };
            readonly collectionIndex: {
                readonly required: true;
                readonly name: "collectionIndex";
                readonly in: "path";
                readonly description: "Collection index";
                readonly schema: {
                    readonly type: "integer";
                    readonly format: "int64";
                };
            };
            readonly oneToOneAssociation: {
                readonly required: true;
                readonly name: "oneToOneAssociation";
                readonly in: "path";
                readonly description: "Association name";
                readonly schema: {
                    readonly type: "string";
                };
            };
            readonly manyToOneAssociation: {
                readonly required: true;
                readonly name: "manyToOneAssociation";
                readonly in: "path";
                readonly description: "Association name";
                readonly schema: {
                    readonly type: "string";
                };
            };
            readonly oneToManyAssociation: {
                readonly required: true;
                readonly name: "oneToManyAssociation";
                readonly in: "path";
                readonly description: "Association name";
                readonly schema: {
                    readonly type: "string";
                };
            };
            readonly manyToManyAssociation: {
                readonly required: true;
                readonly name: "manyToManyAssociation";
                readonly in: "path";
                readonly description: "Association name";
                readonly schema: {
                    readonly type: "string";
                };
            };
            readonly page: {
                readonly name: "page";
                readonly in: "query";
                readonly description: "page number";
                readonly required: false;
                readonly schema: {
                    readonly type: "integer";
                };
            };
            readonly pageSize: {
                readonly name: "pageSize";
                readonly in: "query";
                readonly description: "page size";
                readonly required: false;
                readonly schema: {
                    readonly type: "integer";
                };
            };
            readonly filterByTk: {
                readonly name: "filterByTk";
                readonly in: "query";
                readonly description: "filter by TK(default by ID)";
                readonly schema: {
                    readonly type: "string";
                };
            };
            readonly filterByTks: {
                readonly name: "filterByTks";
                readonly in: "query";
                readonly description: "filter by TKs(default by ID), example: `1,2,3`";
                readonly schema: {
                    readonly type: "string";
                };
            };
            readonly filter: {
                readonly name: "filter";
                readonly in: "query";
                readonly description: "filter items";
                readonly content: {
                    readonly 'application/json': {
                        readonly schema: {
                            readonly type: "object";
                        };
                    };
                };
            };
            readonly sort: {
                readonly name: "sort";
                readonly in: "query";
                readonly description: "sort items by fields, example: `-field1,-field2,field3`";
                readonly schema: {
                    readonly oneOf: readonly [{
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                        readonly example: readonly ["-id", "createdAt"];
                    }, {
                        readonly type: "string";
                        readonly example: "-id,createdAt";
                    }];
                };
            };
            readonly fields: {
                readonly name: "fields";
                readonly in: "query";
                readonly description: "select fields, example: `field1,field2`";
                readonly schema: {
                    readonly oneOf: readonly [{
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                        readonly example: readonly ["id", "createdAt"];
                    }, {
                        readonly type: "string";
                        readonly example: "id,createdAt";
                    }];
                };
            };
            readonly except: {
                readonly name: "except";
                readonly in: "query";
                readonly description: "except fields in results, example: `field1,field2`";
                readonly schema: {
                    readonly oneOf: readonly [{
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                        readonly example: readonly ["id", "createdAt"];
                    }, {
                        readonly type: "string";
                        readonly example: "id,createdAt";
                    }];
                };
            };
            readonly appends: {
                readonly name: "appends";
                readonly in: "query";
                readonly description: "append associations in results, example: `assoc1,assoc2`";
                readonly schema: {
                    readonly oneOf: readonly [{
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                        readonly example: readonly ["id", "createdAt"];
                    }, {
                        readonly type: "string";
                        readonly example: "id,createdAt";
                    }];
                };
            };
            readonly whitelist: {
                readonly name: "whitelist";
                readonly in: "query";
                readonly description: "whitelist for fields changes, example: `field1,field2`";
                readonly schema: {
                    readonly oneOf: readonly [{
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                        readonly example: readonly ["id", "createdAt"];
                    }, {
                        readonly type: "string";
                        readonly example: "id,createdAt";
                    }];
                };
            };
            readonly blacklist: {
                readonly name: "blacklist";
                readonly in: "query";
                readonly description: "blacklist for fields changes, example: `field1,field2`";
                readonly schema: {
                    readonly oneOf: readonly [{
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                        readonly example: readonly ["id", "createdAt"];
                    }, {
                        readonly type: "string";
                        readonly example: "id,createdAt";
                    }];
                };
            };
        };
    };
    paths: {
        '/pm:list': {
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
        '/pm:get': {
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
        '/pm:listEnabled': {
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
        '/pm:listEnabledV2': {
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
        '/pm:add': {
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
        '/pm:update': {
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
        '/pm:enable': {
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
        '/pm:disable': {
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
        '/pm:remove': {
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
        '/app:getLang': {
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
        '/app:getInfo': {
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
        '/app:getPlugins': {
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
        '/app:restart': {
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
        '/app:clearCache': {
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
        '/{collectionName}:list': {
            readonly get: {
                readonly tags: readonly ["$collection"];
                readonly summary: "Returns a list of the collection";
                readonly description: "A list of the collection";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/filter";
                }, {
                    readonly $ref: "#/components/parameters/fields";
                }, {
                    readonly $ref: "#/components/parameters/appends";
                }, {
                    readonly $ref: "#/components/parameters/except";
                }, {
                    readonly $ref: "#/components/parameters/page";
                }, {
                    readonly $ref: "#/components/parameters/pageSize";
                }, {
                    readonly $ref: "#/components/parameters/sort";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}:get': {
            readonly get: {
                readonly tags: readonly ["$collection"];
                readonly summary: "Returns a record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filter";
                }, {
                    readonly $ref: "#/components/parameters/sort";
                }, {
                    readonly $ref: "#/components/parameters/fields";
                }, {
                    readonly $ref: "#/components/parameters/appends";
                }, {
                    readonly $ref: "#/components/parameters/except";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}:create': {
            readonly post: {
                readonly tags: readonly ["$collection"];
                readonly summary: "Create record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/whitelist";
                }, {
                    readonly $ref: "#/components/parameters/blacklist";
                }];
                readonly requestBody: {
                    readonly content: {
                        readonly 'application/json': {
                            readonly schema: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}:update': {
            readonly post: {
                readonly tags: readonly ["$collection"];
                readonly summary: "Update record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filter";
                }, {
                    readonly $ref: "#/components/parameters/whitelist";
                }, {
                    readonly $ref: "#/components/parameters/blacklist";
                }];
                readonly requestBody: {
                    readonly content: {
                        readonly 'application/json': {
                            readonly schema: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}:destroy': {
            readonly post: {
                readonly tags: readonly ["$collection"];
                readonly summary: "Delete record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filter";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}:move': {
            readonly post: {
                readonly tags: readonly ["$collection"];
                readonly summary: "Move record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly name: "sourceId";
                    readonly in: "query";
                    readonly description: "source id";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "targetId";
                    readonly in: "query";
                    readonly description: "move target id";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "method";
                    readonly in: "query";
                    readonly description: "move method, insertAfter or insertBefore";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "sortField";
                    readonly in: "query";
                    readonly description: "sort field name, default is sort";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "targetScope";
                    readonly in: "query";
                    readonly description: "move target scope";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "sticky";
                    readonly in: "query";
                    readonly description: "sticky to top";
                    readonly schema: {
                        readonly type: "boolean";
                    };
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToOneAssociation}:get': {
            readonly get: {
                readonly tags: readonly ["$collection.$oneToOneAssociation"];
                readonly summary: "Returns the relationship record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToOneAssociation";
                }, {
                    readonly $ref: "#/components/parameters/fields";
                }, {
                    readonly $ref: "#/components/parameters/appends";
                }, {
                    readonly $ref: "#/components/parameters/except";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToOneAssociation}:create': {
            readonly post: {
                readonly tags: readonly ["$collection.$oneToOneAssociation"];
                readonly summary: "Create and associate a record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToOneAssociation";
                }, {
                    readonly $ref: "#/components/parameters/whitelist";
                }, {
                    readonly $ref: "#/components/parameters/blacklist";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToOneAssociation}:update': {
            readonly post: {
                readonly tags: readonly ["$collection.$oneToOneAssociation"];
                readonly summary: "Update the relationship record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToOneAssociation";
                }, {
                    readonly $ref: "#/components/parameters/whitelist";
                }, {
                    readonly $ref: "#/components/parameters/blacklist";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToOneAssociation}:destroy': {
            readonly post: {
                readonly tags: readonly ["$collection.$oneToOneAssociation"];
                readonly summary: "Delete and disassociate the relationship record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToOneAssociation";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToOneAssociation}:set': {
            readonly post: {
                readonly tags: readonly ["$collection.$oneToOneAssociation"];
                readonly summary: "Associate a record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToOneAssociation";
                }, {
                    readonly name: "filterByTk";
                    readonly in: "query";
                    readonly required: true;
                    readonly description: "filter by tk";
                    readonly schema: {
                        readonly type: "integer";
                        readonly format: "int64";
                    };
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToOneAssociation}:remove': {
            readonly post: {
                readonly tags: readonly ["$collection.$oneToOneAssociation"];
                readonly summary: "Disassociate the relationship record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToOneAssociation";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToOneAssociation}:get': {
            readonly get: {
                readonly tags: readonly ["$collection.$manyToOneAssociation"];
                readonly summary: "Returns the relationship record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToOneAssociation";
                }, {
                    readonly $ref: "#/components/parameters/fields";
                }, {
                    readonly $ref: "#/components/parameters/appends";
                }, {
                    readonly $ref: "#/components/parameters/except";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToOneAssociation}:create': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToOneAssociation"];
                readonly summary: "Create and associate a record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToOneAssociation";
                }, {
                    readonly $ref: "#/components/parameters/whitelist";
                }, {
                    readonly $ref: "#/components/parameters/blacklist";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToOneAssociation}:update': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToOneAssociation"];
                readonly summary: "Update the relationship record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToOneAssociation";
                }, {
                    readonly $ref: "#/components/parameters/whitelist";
                }, {
                    readonly $ref: "#/components/parameters/blacklist";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToOneAssociation}:destroy': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToOneAssociation"];
                readonly summary: "Delete and disassociate the relationship record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToOneAssociation";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToOneAssociation}:set': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToOneAssociation"];
                readonly summary: "Associate a record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToOneAssociation";
                }, {
                    readonly name: "filterByTk";
                    readonly in: "query";
                    readonly required: true;
                    readonly description: "filter by tk";
                    readonly schema: {
                        readonly type: "integer";
                        readonly format: "int64";
                    };
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToOneAssociation}:remove': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToOneAssociation"];
                readonly summary: "Disassociate the relationship record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToOneAssociation";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:list': {
            readonly get: {
                readonly tags: readonly ["$collection.$oneToManyAssociation"];
                readonly summary: "Returns a list of the one-to-many relationship";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filter";
                }, {
                    readonly $ref: "#/components/parameters/fields";
                }, {
                    readonly $ref: "#/components/parameters/appends";
                }, {
                    readonly $ref: "#/components/parameters/except";
                }, {
                    readonly $ref: "#/components/parameters/page";
                }, {
                    readonly $ref: "#/components/parameters/pageSize";
                }, {
                    readonly $ref: "#/components/parameters/sort";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:get': {
            readonly get: {
                readonly tags: readonly ["$collection.$oneToManyAssociation"];
                readonly summary: "Returns a record of the one-to-many relationship";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filter";
                }, {
                    readonly $ref: "#/components/parameters/fields";
                }, {
                    readonly $ref: "#/components/parameters/appends";
                }, {
                    readonly $ref: "#/components/parameters/except";
                }, {
                    readonly $ref: "#/components/parameters/sort";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:create': {
            readonly post: {
                readonly tags: readonly ["$collection.$oneToManyAssociation"];
                readonly summary: "Create and attach record of the one-to-many relationship";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/whitelist";
                }, {
                    readonly $ref: "#/components/parameters/blacklist";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:update': {
            readonly post: {
                readonly tags: readonly ["$collection.$oneToManyAssociation"];
                readonly summary: "Update record of the one-to-many relationship";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filter";
                }, {
                    readonly $ref: "#/components/parameters/whitelist";
                }, {
                    readonly $ref: "#/components/parameters/blacklist";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:destroy': {
            readonly post: {
                readonly tags: readonly ["$collection.$oneToManyAssociation"];
                readonly summary: "Delete and detach record of the one-to-many relationship";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filter";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:move': {
            readonly post: {
                readonly tags: readonly ["$collection.$oneToManyAssociation"];
                readonly summary: "Move record of the one-to-many relationship";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToManyAssociation";
                }, {
                    readonly name: "sourceId";
                    readonly in: "query";
                    readonly description: "source id";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "targetId";
                    readonly in: "query";
                    readonly description: "move target id";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "method";
                    readonly in: "query";
                    readonly description: "move method, insertAfter or insertBefore";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "sortField";
                    readonly in: "query";
                    readonly description: "sort field name, default is sort";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "targetScope";
                    readonly in: "query";
                    readonly description: "move target scope";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "sticky";
                    readonly in: "query";
                    readonly description: "sticky to top";
                    readonly schema: {
                        readonly type: "boolean";
                    };
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:set': {
            readonly post: {
                readonly tags: readonly ["$collection.$oneToManyAssociation"];
                readonly summary: "Set or reset associations";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filterByTks";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:add': {
            readonly post: {
                readonly tags: readonly ["$collection.$oneToManyAssociation"];
                readonly summary: "Attach record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filterByTks";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:remove': {
            readonly post: {
                readonly tags: readonly ["$collection.$oneToManyAssociation"];
                readonly summary: "Detach record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/oneToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filterByTks";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:list': {
            readonly get: {
                readonly tags: readonly ["$collection.$manyToManyAssociation"];
                readonly summary: "Returns a list of the many-to-many relationship";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filter";
                }, {
                    readonly $ref: "#/components/parameters/fields";
                }, {
                    readonly $ref: "#/components/parameters/appends";
                }, {
                    readonly $ref: "#/components/parameters/except";
                }, {
                    readonly $ref: "#/components/parameters/page";
                }, {
                    readonly $ref: "#/components/parameters/pageSize";
                }, {
                    readonly $ref: "#/components/parameters/sort";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:get': {
            readonly get: {
                readonly tags: readonly ["$collection.$manyToManyAssociation"];
                readonly summary: "Returns a record of the many-to-many relationship";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filter";
                }, {
                    readonly $ref: "#/components/parameters/fields";
                }, {
                    readonly $ref: "#/components/parameters/appends";
                }, {
                    readonly $ref: "#/components/parameters/except";
                }, {
                    readonly $ref: "#/components/parameters/sort";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:create': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToManyAssociation"];
                readonly summary: "Create and attach record of the many-to-many relationship";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/whitelist";
                }, {
                    readonly $ref: "#/components/parameters/blacklist";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:update': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToManyAssociation"];
                readonly summary: "Update record of the many-to-many relationship";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filter";
                }, {
                    readonly $ref: "#/components/parameters/whitelist";
                }, {
                    readonly $ref: "#/components/parameters/blacklist";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:destroy': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToManyAssociation"];
                readonly summary: "Delete and detach record of the one-to-many relationship";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filter";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:move': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToManyAssociation"];
                readonly summary: "Move record of the one-to-many relationship";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToManyAssociation";
                }, {
                    readonly name: "sourceId";
                    readonly in: "query";
                    readonly description: "source id";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "targetId";
                    readonly in: "query";
                    readonly description: "move target id";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "method";
                    readonly in: "query";
                    readonly description: "move method, insertAfter or insertBefore";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "sortField";
                    readonly in: "query";
                    readonly description: "sort field name, default is sort";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "targetScope";
                    readonly in: "query";
                    readonly description: "move target scope";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "sticky";
                    readonly in: "query";
                    readonly description: "sticky to top";
                    readonly schema: {
                        readonly type: "boolean";
                    };
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:set': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToManyAssociation"];
                readonly summary: "Set or reset associations";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filterByTks";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:add': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToManyAssociation"];
                readonly summary: "Attach record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filterByTks";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:remove': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToManyAssociation"];
                readonly summary: "Detach record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }, {
                    readonly $ref: "#/components/parameters/filterByTks";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
        '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:toggle': {
            readonly post: {
                readonly tags: readonly ["$collection.$manyToManyAssociation"];
                readonly summary: "Attach or detach record";
                readonly parameters: readonly [{
                    readonly $ref: "#/components/parameters/collectionName";
                }, {
                    readonly $ref: "#/components/parameters/collectionIndex";
                }, {
                    readonly $ref: "#/components/parameters/manyToManyAssociation";
                }, {
                    readonly $ref: "#/components/parameters/filterByTk";
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: "OK";
                    };
                };
            };
        };
    };
    openapi: "3.0.2";
    info: {
        readonly title: "NocoBase API - Core";
    };
};
export default _default;
