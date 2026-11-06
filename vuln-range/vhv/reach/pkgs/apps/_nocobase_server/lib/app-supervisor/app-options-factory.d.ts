/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { IDatabaseOptions } from '@nocobase/database';
import Application from '../application';
import { AppModelOptions } from './types';
export declare const appOptionsFactory: (appName: string, mainApp: Application, options: AppModelOptions) => {
    dbConnType: string;
    database: {
        tablePrefix: string;
        migrator?: any;
        usingBigIntForId?: boolean;
        underscored?: boolean;
        rawTimezone?: string;
        logger?: import("@nocobase/logger/lib/logger").Logger | import("@nocobase/logger/lib/logger").LoggerOptions;
        customHooks?: any;
        instanceId?: string;
        addAllCollections?: boolean;
        dialect?: import("sequelize").Dialect;
        dialectModule?: object;
        dialectModulePath?: string;
        dialectOptions?: object;
        storage?: string;
        database?: string;
        username?: string;
        password?: string;
        host?: string;
        port?: number;
        ssl?: boolean;
        protocol?: string;
        define?: import("sequelize").ModelOptions<import("sequelize").Model<any, any>>;
        query?: import("sequelize").QueryOptions;
        set?: import("sequelize").DefaultSetOptions;
        sync?: import("@nocobase/database").SyncOptions;
        timezone?: string;
        omitNull?: boolean;
        native?: boolean;
        replication?: false | import("sequelize").ReplicationOptions;
        pool?: import("sequelize").PoolOptions;
        quoteIdentifiers?: boolean;
        isolationLevel?: string;
        transactionType?: import("@nocobase/database").Transaction.TYPES;
        typeValidation?: boolean;
        operatorsAliases?: import("sequelize").OperatorsAliases;
        standardConformingStrings?: boolean;
        clientMinMessages?: string | boolean;
        hooks?: Partial<import("sequelize/types/hooks").SequelizeHooks<import("sequelize").Model<any, any>, any, any>>;
        minifyAliases?: boolean;
        logQueryParameters?: boolean;
        retry?: import("retry-as-promised").Options;
        schema?: string;
        attributeBehavior?: "escape" | "throw" | "unsafe-legacy";
        logging?: boolean | ((sql: string, timing?: number) => void);
        benchmark?: boolean;
    };
    plugins: string[];
    resourcer: {
        prefix: string;
    };
    cacheManager: {
        prefix: string;
        defaultStore?: string;
        stores?: {
            [storeType: string]: {
                [key: string]: any;
                store?: "memory" | import("cache-manager").FactoryStore<import("cache-manager").Store, any>;
                close?: (store: import("cache-manager").Store) => Promise<void>;
            };
        };
    };
    logger: import("../application").AppLoggerOptions;
} & {
    name: string;
    dbConnType?: string;
    database?: IDatabaseOptions;
};
