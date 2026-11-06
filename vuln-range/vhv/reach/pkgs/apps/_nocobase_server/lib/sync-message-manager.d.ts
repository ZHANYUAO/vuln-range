/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { Transactionable } from '@nocobase/database';
import Application from './application';
import { PubSubCallback, PubSubManager, PubSubManagerPublishOptions } from './pub-sub-manager';
export declare class SyncMessageManager {
    protected app: Application;
    protected options: any;
    protected versionManager: SyncMessageVersionManager;
    protected pubSubManager: PubSubManager;
    constructor(app: Application, options?: any);
    get debounce(): any;
    publish(channel: string, message: any, options?: PubSubManagerPublishOptions & Transactionable): Promise<unknown>;
    subscribe(channel: string, callback: PubSubCallback): Promise<void>;
    unsubscribe(channel: string, callback: PubSubCallback): Promise<any>;
    sync(): Promise<void>;
}
export declare class SyncMessageVersionManager {
}
