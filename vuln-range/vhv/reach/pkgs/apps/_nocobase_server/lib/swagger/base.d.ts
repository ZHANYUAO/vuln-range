/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
declare const _default: {
    readonly openapi: "3.0.2";
    readonly info: {
        readonly title: "NocoBase API - Core";
    };
    readonly tags: readonly [{
        readonly name: "$collection";
        readonly description: "Data table";
    }, {
        readonly name: "$collection.$oneToOneAssociation";
        readonly description: "One to one relationship";
    }, {
        readonly name: "$collection.$manyToOneAssociation";
        readonly description: "Many to one relationship";
    }, {
        readonly name: "$collection.$oneToManyAssociation";
        readonly description: "One to many relationship";
    }, {
        readonly name: "$collection.$manyToManyAssociation";
        readonly description: "Many to many relationship";
    }, {
        readonly name: "app";
        readonly description: "app";
    }, {
        readonly name: "pm";
        readonly description: "pm";
    }];
    readonly components: {
        readonly parameters: {
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
};
export default _default;
