/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { type PubSubManagerSubscribeOptions } from './types';
export declare class HandlerManager {
    protected publisherId: string;
    handlers: Map<any, any>;
    uniqueMessageHandlers: Map<any, any>;
    constructor(publisherId: string);
    protected getMessageHash(message: any): Promise<string>;
    protected verifyMessage({ onlySelf, skipSelf, publisherId }: {
        onlySelf: any;
        skipSelf: any;
        publisherId: any;
    }): boolean;
    protected debounce(func: any, wait: number): any;
    handleMessage({ channel, message, callback, debounce }: {
        channel: any;
        message: any;
        callback: any;
        debounce: any;
    }): Promise<void>;
    wrapper(channel: any, callback: any, options: any): (wrappedMessage: any) => Promise<void>;
    set(channel: string, callback: any, options: PubSubManagerSubscribeOptions): (wrappedMessage: any) => Promise<void>;
    get(channel: string, callback: any): any;
    delete(channel: string, callback: any): any;
    cancelPendingDebounce(): void;
    reset(): void;
    each(callback: any): Promise<void>;
}
