/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { Repository } from '@nocobase/database';
import { PluginManager } from './plugin-manager';
export declare class PluginManagerRepository extends Repository {
    /**
     * @internal
     */
    pm: PluginManager;
    /**
     * @internal
     */
    setPluginManager(pm: PluginManager): void;
    createByName(nameOrPkgs: any): Promise<void>;
    has(nameOrPkg: string): Promise<boolean>;
    /**
     * @deprecated
     */
    remove(name: string | string[]): Promise<void>;
    /**
     * @deprecated
     */
    enable(name: string | string[]): Promise<string[]>;
    updateVersions(): Promise<void>;
    /**
     * @deprecated
     */
    disable(name: string | string[]): Promise<string[]>;
    sort(names: string[]): Promise<string[]>;
    getItems(): Promise<any[]>;
    init(): Promise<void>;
}
