/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
/// <reference types="node" />
import { CleanOptions, Collection, SyncOptions } from '@nocobase/database';
import net from 'net';
import Application from '../application';
import { Plugin } from '../plugin';
import { PluginManagerRepository } from './plugin-manager-repository';
import { PluginData } from './types';
export declare const sleep: (timeout?: number) => Promise<unknown>;
export interface PluginManagerOptions {
    app: Application;
    plugins?: any[];
}
export interface InstallOptions {
    cliArgs?: any[];
    clean?: CleanOptions | boolean;
    force?: boolean;
    sync?: SyncOptions;
}
export declare class AddPresetError extends Error {
}
export declare class PluginManager {
    options: PluginManagerOptions;
    private static compatibleCache;
    private static compatiblePending;
    static checkAndGetCompatible(packageName: string): Promise<{
        isCompatible: boolean;
        depsCompatible: import("./utils").DepCompatible[];
    }>;
    /**
     * @internal
     */
    app: Application;
    /**
     * @internal
     */
    collection: Collection;
    /**
     * @internal
     */
    pluginInstances: Map<typeof Plugin, Plugin<any>>;
    /**
     * @internal
     */
    pluginAliases: Map<string, Plugin<any>>;
    /**
     * @internal
     */
    server: net.Server;
    /**
     * @internal
     */
    constructor(options: PluginManagerOptions);
    /**
     * @internal
     */
    _repository: PluginManagerRepository;
    get repository(): PluginManagerRepository;
    static packageExists(nameOrPkg: string): Promise<boolean>;
    /**
     * @internal
     */
    static getPackageJson(nameOrPkg: string): Promise<any>;
    /**
     * @internal
     */
    static getPackageName(name: string): Promise<any>;
    /**
     * @internal
     */
    static getPluginPkgPrefix(): string[];
    /**
     * @internal
     */
    static findPackage(name: string): Promise<any>;
    /**
     * @internal
     */
    static clearCache(packageName: string): void;
    /**
     * @internal
     */
    static resolvePlugin(pluginName: string | typeof Plugin, isUpgrade?: boolean, isPkg?: boolean): Promise<any>;
    static parsedNames: {};
    static parseName(nameOrPkg: string): Promise<any>;
    addPreset(plugin: string | typeof Plugin, options?: any): void;
    getPlugins(): Map<typeof Plugin, Plugin<any>>;
    getAliases(): IterableIterator<string>;
    get<T extends Plugin>(name: string | typeof Plugin | (new () => T)): T;
    has(name: string | typeof Plugin): boolean;
    del(name: any): void;
    create(pluginName: string, options?: {
        forceRecreate?: boolean;
    }): Promise<void>;
    addOrThrow(plugin?: string | typeof Plugin, options?: any, insert?: boolean, isUpgrade?: boolean): Promise<void>;
    add(plugin?: string | typeof Plugin, options?: any, insert?: boolean, isUpgrade?: boolean): Promise<void>;
    /**
     * @internal
     */
    initPlugins(): Promise<void>;
    /**
     * @internal
     */
    loadCommands(): Promise<void>;
    load(options?: any): Promise<void>;
    install(options?: InstallOptions): Promise<void>;
    enable(nameOrPkg: string | string[]): Promise<void>;
    disable(name: string | string[]): Promise<void>;
    remove(name: string | string[], options?: {
        removeDir?: boolean;
        force?: boolean;
    }): Promise<void>;
    pull(urlOrName: string | string[], options?: PluginData, emitStartedEvent?: boolean): Promise<void>;
    /**
     * @internal
     */
    addViaCLI(urlOrName: string | string[], options?: PluginData, emitStartedEvent?: boolean): Promise<void>;
    /**
     * @internal
     */
    addByNpm(options: {
        packageName: string;
        name?: string;
        registry: string;
        authToken?: string;
    }, throwError?: boolean): Promise<void>;
    /**
     * @internal
     */
    addByFile(options: {
        file: string;
        registry?: string;
        authToken?: string;
        type?: string;
        name?: string;
    }, throwError?: boolean): Promise<void>;
    /**
     * @internal
     */
    addByCompressedFileUrl(options: {
        compressedFileUrl: string;
        registry?: string;
        authToken?: string;
        type?: string;
        name?: string;
    }, throwError?: boolean): Promise<void>;
    update(nameOrPkg: string | string[], options: PluginData, emitStartedEvent?: boolean): Promise<void>;
    /**
     * @internal
     */
    upgradeByNpm(values: PluginData): Promise<void>;
    /**
     * @internal
     */
    upgradeByCompressedFileUrl(options: PluginData): Promise<void>;
    /**
     * @internal
     */
    getNameByPackageName(packageName: string): string;
    list(options?: any): Promise<any[]>;
    /**
     * @internal
     */
    getNpmVersionList(name: string): Promise<string[]>;
    /**
     * @internal
     */
    loadPresetMigrations(): Promise<{
        beforeLoad: {
            up: () => Promise<void>;
        };
        afterSync: {
            up: () => Promise<void>;
        };
        afterLoad: {
            up: () => Promise<void>;
        };
    }>;
    /**
     * @internal
     */
    loadOtherMigrations(): Promise<{
        beforeLoad: {
            up: () => Promise<void>;
        };
        afterSync: {
            up: () => Promise<void>;
        };
        afterLoad: {
            up: () => Promise<void>;
        };
    }>;
    /**
     * @internal
     */
    loadPresetPlugins(): Promise<void>;
    upgrade(): Promise<void>;
    /**
     * @internal
     */
    initOtherPlugins(): Promise<void>;
    /**
     * @internal
     */
    initPresetPlugins(): Promise<void>;
    private sort;
}
export default PluginManager;
