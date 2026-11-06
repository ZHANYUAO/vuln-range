/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { Logger } from '@nocobase/logger';
import { createClient } from 'redis';
type RedisClientOptions = NonNullable<Parameters<typeof createClient>[0]>;
export type Redis = ReturnType<typeof createClient>;
export interface RedisConfig extends RedisClientOptions {
    connectionString?: string;
}
export declare class RedisConnectionManager {
    private logger;
    private config;
    private connections;
    private connectionConfigs;
    private connecting;
    constructor(config: {
        redisConfig?: RedisConfig;
        logger: Logger;
    });
    private bindEvents;
    private mergeConfig;
    private hasConnectionOptions;
    private buildClientOptions;
    private ensureConnected;
    private getClient;
    getConnection(key?: string, config?: RedisConfig): Redis | null;
    private waitUntilReady;
    getConnectionSync(key?: string, config?: RedisConfig): Promise<Redis>;
    private closeConnection;
    close(): Promise<void>;
}
export {};
