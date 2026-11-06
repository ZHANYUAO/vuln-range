/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import Application from '../application';
import { HandlerManager } from './handler-manager';
import { PubSubCallback, type IPubSubAdapter, type PubSubManagerOptions, type PubSubManagerPublishOptions, type PubSubManagerSubscribeOptions } from './types';
export declare const createPubSubManager: (app: Application, options: PubSubManagerOptions) => PubSubManager;
export declare class PubSubManager {
    protected app: Application;
    protected options: PubSubManagerOptions;
    protected publisherId: string;
    protected adapter: IPubSubAdapter;
    protected handlerManager: HandlerManager;
    constructor(app: Application, options?: PubSubManagerOptions);
    setAdapter(adapter: IPubSubAdapter): void;
    getFullChannel(channel: string): string;
    isConnected(): Promise<boolean>;
    connect(): Promise<void>;
    close(): Promise<any>;
    subscribe(channel: string, callback: PubSubCallback, options?: PubSubManagerSubscribeOptions): Promise<void>;
    unsubscribe(channel: string, callback: PubSubCallback): Promise<any>;
    publish(channel: string, message: any, options?: PubSubManagerPublishOptions): Promise<void>;
}
