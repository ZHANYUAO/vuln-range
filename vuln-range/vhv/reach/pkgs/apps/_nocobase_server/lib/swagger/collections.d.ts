/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
declare const _default: {
    readonly '/{collectionName}:list': {
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
    readonly '/{collectionName}:get': {
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
    readonly '/{collectionName}:create': {
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
    readonly '/{collectionName}:update': {
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
    readonly '/{collectionName}:destroy': {
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
    readonly '/{collectionName}:move': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToOneAssociation}:get': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToOneAssociation}:create': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToOneAssociation}:update': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToOneAssociation}:destroy': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToOneAssociation}:set': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToOneAssociation}:remove': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToOneAssociation}:get': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToOneAssociation}:create': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToOneAssociation}:update': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToOneAssociation}:destroy': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToOneAssociation}:set': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToOneAssociation}:remove': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:list': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:get': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:create': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:update': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:destroy': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:move': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:set': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:add': {
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
    readonly '/{collectionName}/{collectionIndex}/{oneToManyAssociation}:remove': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:list': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:get': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:create': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:update': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:destroy': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:move': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:set': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:add': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:remove': {
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
    readonly '/{collectionName}/{collectionIndex}/{manyToManyAssociation}:toggle': {
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
export default _default;
