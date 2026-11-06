/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { Context } from '@nocobase/actions';
import { DataSourceOptions, SequelizeDataSource } from '@nocobase/data-source-manager';
type MainDataSourceStatus = 'loaded' | 'loading';
export declare class MainDataSource extends SequelizeDataSource {
    status: MainDataSourceStatus;
    init(options?: DataSourceOptions): void;
    readTables(): Promise<{
        name: string;
    }[]>;
    private tables2Collections;
    loadTables(ctx: Context, tables: string[]): Promise<void>;
    private getLoadedCollections;
    syncFieldsFromDatabase(ctx: any, collectionNames?: string[]): Promise<void>;
}
export {};
