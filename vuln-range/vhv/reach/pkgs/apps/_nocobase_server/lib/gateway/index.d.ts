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
/// <reference types="node" />
import { SystemLogger } from '@nocobase/logger';
import { Registry, Toposort, ToposortOptions } from '@nocobase/utils';
import { EventEmitter } from 'events';
import http, { IncomingMessage, ServerResponse } from 'http';
import { ApplicationOptions, Application } from '../application';
import { IPCSocketClient } from './ipc-socket-client';
import { IPCSocketServer } from './ipc-socket-server';
import { WSServer } from './ws-server';
import { Duplex } from 'node:stream';
export { getHost, getHostname } from './utils';
export interface IncomingRequest {
    url: string;
    headers: any;
}
export interface GatewayRequestContext {
    req: IncomingMessage;
    res: ServerResponse;
    appName: string;
}
type GatewayMiddleware = (ctx: GatewayRequestContext, next: () => Promise<void>) => Promise<void> | void;
export type AppSelector = (req: IncomingRequest) => string | Promise<string>;
export type AppSelectorMiddleware = (ctx: AppSelectorMiddlewareContext, next: () => Promise<void>) => void;
interface StartHttpServerOptions {
    port: number;
    host: string;
    callback?: (server: http.Server) => void;
}
interface RunOptions {
    mainAppOptions: ApplicationOptions;
}
export interface AppSelectorMiddlewareContext {
    req: IncomingMessage | IncomingRequest;
    resolvedAppName: string | null;
}
export declare class Gateway extends EventEmitter {
    private static instance;
    middlewares: Toposort<GatewayMiddleware>;
    /**
     * use main app as default app to handle request
     */
    selectorMiddlewares: Toposort<AppSelectorMiddleware>;
    server: http.Server | null;
    ipcSocketServer: IPCSocketServer | null;
    wsServer: WSServer;
    loggers: Registry<SystemLogger>;
    private port;
    private host;
    private socketPath;
    private v2IndexTemplateCache;
    private terminating;
    private getOriginalRequestUrl;
    private proxyRequestToSubApp;
    private onTerminate;
    private constructor();
    static getInstance(options?: any): Gateway;
    use(middleware: GatewayMiddleware, options?: ToposortOptions): void;
    static getIPCSocketClient(): Promise<false | IPCSocketClient>;
    destroy(): void;
    reset(): void;
    addAppSelectorMiddleware(middleware: AppSelectorMiddleware, options?: ToposortOptions): void;
    getLogger(appName: string, res: ServerResponse): import("@nocobase/logger/lib/logger").Logger;
    responseError(res: ServerResponse, error: {
        status: number;
        maintaining: boolean;
        message: string;
        code: string;
    }): void;
    responseErrorWithCode(code: any, res: any, options: any): void;
    private getV2PublicPath;
    private getAppPublicPath;
    private isV2Request;
    private isV2IndexRequest;
    private getV2RuntimeConfig;
    private getV2RuntimeConfigScript;
    private getV2AssetPublicPath;
    private getV2IndexTemplate;
    private renderV2IndexHtml;
    requestHandler(req: IncomingMessage, res: ServerResponse): Promise<void>;
    getAppSelectorMiddlewares(): Toposort<AppSelectorMiddleware>;
    getRequestHandleAppName(req: IncomingMessage | IncomingRequest): Promise<string>;
    private handleUpgrade;
    getCallback(): any;
    watch(): Promise<void>;
    run(options: RunOptions): Promise<void>;
    isStart(): boolean;
    isHelp(): boolean;
    getStartOptions(): import("commander").OptionValues;
    start(options: StartHttpServerOptions): void;
    startIPCSocketServer(): void;
    startHttpServer(options: StartHttpServerOptions): void;
    tryConnectToIPCServer(): Promise<false | IPCSocketClient>;
    getIPCSocketClient(): Promise<IPCSocketClient>;
    close(): void;
    private static requestHandlers;
    static registerRequestHandler(handler: (req: IncomingRequest, res: ServerResponse, app: Application) => boolean | void): void;
    static unregisterRequestHandler(handler: (req: IncomingRequest, res: ServerResponse, app: Application) => boolean | void): void;
    private static wsServers;
    static registerWsHandler(wsServer: (req: IncomingMessage, socket: Duplex, head: Buffer, app: Application) => boolean | void): void;
    static unregisterWsHandler(wsServer: (req: IncomingMessage, socket: Duplex, head: Buffer, app: Application) => boolean | void): void;
}
