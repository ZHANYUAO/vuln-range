/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { IncomingMessage, ServerResponse } from 'http';
import { AsyncEmitter } from '@nocobase/utils';
import { EventEmitter } from 'events';
import Application, { ApplicationOptions } from '../application';
import type { AppDiscoveryAdapter, AppProcessAdapter, AppStatus, EnvironmentInfo, GetAppOptions, ProcessCommand, AppDbCreator, AppOptionsFactory, AppDbCreatorOptions, AppCommandAdapter, AppModel, BootstrapLock, AppCondition, GetAppsByConditionOptions } from './types';
import { Predicate } from './condition-registry';
import { PubSubManagerPublishOptions } from '../pub-sub-manager';
import { Transaction, Transactionable } from '@nocobase/database';
import { SystemLogger } from '@nocobase/logger';
import AesEncryptor from '../aes-encryptor';
export type AppDiscoveryAdapterFactory = (context: {
    supervisor: AppSupervisor;
}) => AppDiscoveryAdapter;
export type AppProcessAdapterFactory = (context: {
    supervisor: AppSupervisor;
}) => AppProcessAdapter;
export type AppCommandAdapterFactory = (context: {
    supervisor: AppSupervisor;
}) => AppCommandAdapter;
export declare class AppSupervisor extends EventEmitter implements AsyncEmitter {
    private static instance;
    private static discoveryAdapterFactories;
    private static processAdapterFactories;
    private static commandAdapterFactories;
    private static defaultDiscoveryAdapterName;
    private static defaultProcessAdapterName;
    private static defaultCommandAdapterName;
    runningMode: 'single' | 'multiple';
    singleAppName: string | null;
    logger: SystemLogger;
    aesEncryptor?: AesEncryptor;
    emitAsync: (event: string | symbol, ...args: any[]) => Promise<boolean>;
    private discoveryAdapter;
    private processAdapter;
    private commandAdapter;
    private discoveryAdapterName;
    private processAdapterName;
    private commandAdapterName;
    private appDbCreator;
    private appConditions;
    private appManifests;
    private appSsoIssuer?;
    appOptionsFactory: AppOptionsFactory;
    private environmentHeartbeatInterval;
    private environmentHeartbeatTimeout;
    private environmentHeartbeatTimer;
    private constructor();
    private resolveDiscoveryAdapterName;
    private resolveProcessAdapterName;
    private resolveCommandAdapterName;
    private createDiscoveryAdapter;
    private isProcessCapableAdapter;
    private createProcessAdapter;
    private createCommandAdapter;
    static registerDiscoveryAdapter(name: string, factory: AppDiscoveryAdapterFactory): void;
    static registerProcessAdapter(name: string, factory: AppProcessAdapterFactory): void;
    static registerCommandAdapter(name: string, factory: AppCommandAdapterFactory): void;
    static setDefaultDiscoveryAdapter(name: string): void;
    static setDefaultProcessAdapter(name: string): void;
    static setDefaultCommandAdapter(name: string): void;
    static getInstance(): AppSupervisor;
    get apps(): Record<string, Application>;
    get appStatus(): Record<string, AppStatus>;
    get appErrors(): Record<string, Error>;
    get lastSeenAt(): Map<string, number>;
    get lastMaintainingMessage(): Record<string, string>;
    get statusBeforeCommanding(): Record<string, AppStatus>;
    get environmentName(): string;
    get environmentUrl(): string;
    get environmentProxyUrl(): string;
    getProcessAdapter(): AppProcessAdapter;
    getDiscoveryAdapter(): AppDiscoveryAdapter;
    registerAppDbCreator(condition: Predicate<AppDbCreatorOptions>, creator: AppDbCreator, priority?: number): void;
    createDatabase(options: AppDbCreatorOptions): Promise<void>;
    setAppOptionsFactory(factory: AppOptionsFactory): void;
    setAppSsoIssuer(issuer?: string): void;
    getAppSsoIssuer(): string;
    bootstrapApp(appName: string): Promise<void>;
    initApp({ appName, options }: {
        appName: string;
        options?: {
            upgrading?: boolean;
        };
    }): Promise<void>;
    setAppError(appName: string, error: Error): void;
    hasAppError(appName: string): boolean;
    clearAppError(appName: string): void;
    reset(): Promise<void>;
    destroy(): Promise<void>;
    getAppStatus(appName: string, defaultStatus?: AppStatus): Promise<AppStatus>;
    setAppStatus(appName: string, status: AppStatus, options?: {}): Promise<void>;
    clearAppStatus(appName: string): Promise<void>;
    getAppsStatuses(appNames?: string[]): Promise<import("./types").AppStatusesResult>;
    getBootstrapLock(appName: string): Promise<BootstrapLock | null>;
    registerApp({ appModel, mainApp, hook }: {
        appModel: AppModel;
        mainApp?: Application;
        hook?: boolean;
    }): Application<import("../application").DefaultState, import("../application").DefaultContext>;
    bootMainApp(options: ApplicationOptions): Application<import("../application").DefaultState, import("../application").DefaultContext>;
    setAppLastSeenAt(appName: string): Promise<void>;
    getAppLastSeenAt(appName: string): Promise<number>;
    addAppModel(appModel: AppModel): Promise<void>;
    getAppModel(appName: string): Promise<AppModel>;
    listAppModels(): Promise<AppModel[]>;
    setAppManifestItem(appName: string, namespace: string, itemKey: string, item: unknown): Promise<void>;
    removeAppManifestItem(appName: string, namespace: string, itemKey: string): Promise<void>;
    removeAppManifest(appName: string, namespace: string): Promise<void>;
    getAppManifestItems<T = unknown>(appName: string, namespace: string): Promise<T[]>;
    getAppManifests<T = unknown>(namespace: string, appNames: string[]): Promise<Record<string, T[]>>;
    private getAppManifestKey;
    private getOrCreateAppManifest;
    registerAppCondition(name: string, condition: AppCondition): void;
    unregisterAppCondition(name: string): void;
    getAppCondition(name: string): AppCondition;
    getAppConditions(): [string, AppCondition][];
    getAppsByCondition(conditionName: string, options?: GetAppsByConditionOptions): Promise<string[]>;
    removeAppModel(appName: string): Promise<void>;
    getAppNameByCName(cname: string): Promise<string>;
    addAppsToCondition(conditionName: string, environmentName: string, appNames: string[]): Promise<void>;
    removeAppsFromCondition(conditionName: string, environmentName: string, appNames: string[]): Promise<void>;
    addApp(app: Application): Application<import("../application").DefaultState, import("../application").DefaultContext>;
    getApp(appName: string, options?: GetAppOptions): Promise<Application<import("../application").DefaultState, import("../application").DefaultContext>>;
    hasApp(appName: string): boolean;
    createApp(options: {
        appModel: AppModel;
        mainApp?: Application;
        transaction?: Transaction;
    }, context?: {
        requestId: string;
    }): Promise<void>;
    startApp(appName: string, context?: {
        requestId: string;
    }): Promise<void>;
    stopApp(appName: string, context?: {
        requestId: string;
    }): Promise<void>;
    removeApp(appName: string, context?: {
        requestId: string;
    }): Promise<void>;
    upgradeApp(appName: string, context?: {
        requestId: string;
    }): Promise<void>;
    dispatchAppEvent(appName: string, event: string, payload?: any, context?: {
        requestId: string;
    }): Promise<void>;
    /**
     * @deprecated
     * use {#getApps} instead
     */
    subApps(): Application<import("../application").DefaultState, import("../application").DefaultContext>[];
    getApps(): Application<import("../application").DefaultState, import("../application").DefaultContext>[];
    proxyWeb(appName: string, req: IncomingMessage, res: ServerResponse): Promise<boolean>;
    proxyWs(req: IncomingMessage, socket: any, head: Buffer): Promise<boolean>;
    registerEnvironment(mainApp: Application): Promise<void>;
    private getEnvironmentInfo;
    unregisterEnvironment(): Promise<void>;
    private normalizeEnvInfo;
    listEnvironments(): Promise<EnvironmentInfo[]>;
    getEnvironment(environmentName: string): Promise<EnvironmentInfo>;
    heartbeatEnvironment(mainApp: Application): Promise<void>;
    private stopEnvironmentHeartbeat;
    dispatchCommand(command: ProcessCommand): Promise<void>;
    registerCommandHandler(mainApp: Application): void;
    sendSyncMessage(mainApp: Application, message: {
        type: string;
        appName: string;
    }, options?: PubSubManagerPublishOptions & Transactionable): Promise<void>;
    on(eventName: string | symbol, listener: (...args: any[]) => void): this;
    private bindAppEvents;
}
export type { AppDiscoveryAdapter, AppProcessAdapter, AppCommandAdapter, AppStatus, ProcessCommand, EnvironmentInfo, GetAppOptions, AppDbCreator, AppOptionsFactory, AppModel, AppModelOptions, AppCondition, GetAppsByConditionOptions, BootstrapLock, } from './types';
export { MainOnlyAdapter } from './main-only-adapter';
