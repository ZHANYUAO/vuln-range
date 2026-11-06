/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import Application from '../application';
import type { AppDiscoveryAdapter, AppProcessAdapter, AppStatus, GetAppOptions } from './types';
import type { AppSupervisor } from './index';
/** Minimal single-process adapter only for booting the main application. */
export declare class MainOnlyAdapter implements AppDiscoveryAdapter, AppProcessAdapter {
    protected readonly supervisor: AppSupervisor;
    readonly name: string;
    apps: Record<string, Application>;
    status: AppStatus;
    appErrors: Record<string, Error>;
    constructor(supervisor: AppSupervisor);
    getApp(appName: string, options?: GetAppOptions): Promise<Application<import("../application").DefaultState, import("../application").DefaultContext>>;
    bootstrapApp(appName: string): Promise<void>;
    addApp(app: Application): Application<import("../application").DefaultState, import("../application").DefaultContext>;
    getApps(): Application<import("../application").DefaultState, import("../application").DefaultContext>[];
    listAppModels(): Promise<any[]>;
    hasApp(appName: string): boolean;
    startApp(appName: string): Promise<void>;
    stopApp(appName: string): Promise<void>;
    removeApp(appName: string): Promise<void>;
    upgradeApp(appName: string): Promise<void>;
    dispatchAppEvent(appName: string, event: string, payload?: any, _context?: {
        requestId: string;
    }): Promise<void>;
    removeAllApps(): Promise<void>;
    setAppStatus(appName: string, status: AppStatus, options?: {}): void;
    getAppStatus(appName: string, defaultStatus?: AppStatus): AppStatus;
    hasAppError(appName: string): boolean;
    setAppError(appName: string, error: Error): void;
    clearAppError(appName: string): void;
    setAppLastSeenAt(): void;
    getAppLastSeenAt(appName: string): any;
}
