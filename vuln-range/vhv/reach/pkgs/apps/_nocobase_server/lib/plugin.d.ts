/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { Model, Transactionable } from '@nocobase/database';
import { LoggerOptions } from '@nocobase/logger';
import type { TFuncKey, TOptions } from 'i18next';
import { Application } from './application';
import { InstallOptions } from './plugin-manager';
export interface PluginInterface {
    beforeLoad?: () => void;
    load(): any;
    getName(): string;
}
export interface PluginOptions {
    activate?: boolean;
    displayName?: string;
    description?: string;
    version?: string;
    enabled?: boolean;
    install?: (this: Plugin) => void;
    load?: (this: Plugin) => void;
    plugin?: typeof Plugin;
    [key: string]: any;
}
export declare abstract class Plugin<O = any> implements PluginInterface {
    options: any;
    app: Application;
    /**
     * @deprecated
     */
    model: Model;
    /**
     * @internal
     */
    state: any;
    /**
     * @internal
     */
    private _sourceDir;
    constructor(app: Application, options?: any);
    get log(): import("@nocobase/logger/lib/logger").Logger;
    get name(): string;
    get ai(): import("@nocobase/ai").AIManager;
    get pm(): import("./plugin-manager").PluginManager;
    get db(): import("@nocobase/database").default;
    get enabled(): any;
    set enabled(value: any);
    get installed(): any;
    set installed(value: any);
    get isPreset(): any;
    getName(): any;
    createLogger(options: LoggerOptions): import("@nocobase/logger/lib/logger").Logger;
    afterAdd(): void;
    beforeLoad(): void;
    load(): Promise<void>;
    install(options?: InstallOptions): Promise<void>;
    upgrade(): Promise<void>;
    beforeEnable(): Promise<void>;
    afterEnable(): Promise<void>;
    beforeDisable(): Promise<void>;
    afterDisable(): Promise<void>;
    beforeRemove(): Promise<void>;
    afterRemove(): Promise<void>;
    handleSyncMessage(message: any): Promise<void>;
    sendSyncMessage(message: any, options?: Transactionable): Promise<void>;
    /**
     * @deprecated
     */
    importCollections(collectionsPath: string): Promise<void>;
    /**
     * @internal
     */
    setOptions(options: any): void;
    /**
     * @internal
     */
    loadMigrations(): Promise<{
        beforeLoad: any[];
        afterSync: any[];
        afterLoad: any[];
    }>;
    private getPluginBasePath;
    /**
     * @internal
     */
    loadCollections(): Promise<void>;
    /**
     * @internal
     */
    loadAI(): Promise<void>;
    /**
     * @deprecated
     */
    requiredPlugins(): any[];
    t(text: TFuncKey | TFuncKey[], options?: TOptions): import("i18next").TFunctionDetailedResult<object>;
    /**
     * @experimental
     */
    toJSON(options?: any): Promise<any>;
}
export default Plugin;
