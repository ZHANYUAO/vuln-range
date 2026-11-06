/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
export type PluginClientLane = 'client' | 'client-v2';
export declare class PackageUrls {
    static items: Record<string, string | undefined>;
    static clear(): void;
    static getCacheKey(packageName: string, lane: PluginClientLane): string;
    static get(packageName: string, lane?: PluginClientLane): Promise<string>;
    static getAppDevUrl(packageName: string, lane: PluginClientLane): string;
    static hasClientEntry(packageName: string, lane: PluginClientLane): Promise<boolean>;
    static fetch(packageName: string, lane?: PluginClientLane): Promise<string>;
}
declare const _default: {
    name: string;
    actions: {
        add(ctx: any, next: any): Promise<void>;
        update(ctx: any, next: any): Promise<void>;
        npmVersionList(ctx: any, next: any): Promise<void>;
        enable(ctx: any, next: any): Promise<void>;
        disable(ctx: any, next: any): Promise<void>;
        remove(ctx: any, next: any): Promise<void>;
        list(ctx: any, next: any): Promise<any>;
        listEnabled(ctx: any, next: any): Promise<void>;
        listEnabledV2(ctx: any, next: any): Promise<void>;
        get(ctx: any, next: any): Promise<void>;
    };
};
export default _default;
