/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import Application from './application';
import { SystemLogger } from '@nocobase/logger';
export declare const QUEUE_DEFAULT_INTERVAL = 250;
export declare const QUEUE_DEFAULT_CONCURRENCY = 1;
export declare const QUEUE_DEFAULT_ACK_TIMEOUT = 15000;
export type QueueCallbackOptions = {
    id?: string;
    retried?: number;
    signal?: AbortSignal;
    queueOptions?: QueueMessageOptions;
};
export type QueueCallback = (message: any, options: QueueCallbackOptions) => Promise<void>;
export type QueueEventOptions = {
    /**
     * @experimental
     */
    interval?: number;
    concurrency?: number;
    /**
     * Shared across multiple applications.
     * Will not use app prefix for channel name.
     * @experimental
     */
    shared?: boolean;
    idle(): boolean;
    process: QueueCallback;
};
export type QueueMessageOptions = {
    timeout?: number;
    maxRetries?: number;
    retried?: number;
    timestamp?: number;
};
export interface IEventQueueAdapter {
    isConnected(): boolean;
    connect(): Promise<void> | void;
    close(): Promise<void> | void;
    subscribe(channel: string, event: QueueEventOptions): void;
    unsubscribe(channel: string): void;
    publish(channel: string, message: any, options: QueueMessageOptions): Promise<void> | void;
}
export interface EventQueueOptions {
    channelPrefix?: string;
}
export declare class MemoryEventQueueAdapter implements IEventQueueAdapter {
    private options;
    private connected;
    private reading;
    private scheduledChannels;
    protected events: Map<string, QueueEventOptions>;
    protected queues: Map<string, {
        id: string;
        content: any;
        options?: QueueMessageOptions;
    }[]>;
    get processing(): Promise<void[]>;
    private get storagePath();
    listen: (channel: string) => void;
    private scheduleListen;
    constructor(options: {
        appName: string;
        logger: SystemLogger;
    });
    isConnected(): boolean;
    setConnected(connected: boolean): void;
    loadFromStorage(): Promise<void>;
    private saveToStorage;
    connect(): Promise<void>;
    close(): Promise<void>;
    subscribe(channel: string, options: QueueEventOptions): void;
    unsubscribe(channel: string): void;
    publish(channel: string, content: any, options?: QueueMessageOptions): void;
    consume(channel: string, once?: boolean): Promise<void>;
    read(channel: string, n: number): Promise<void>[];
    process(channel: string, { id, message }: {
        id: any;
        message: any;
    }): Promise<void>;
}
export declare class EventQueue {
    protected app: Application;
    protected options: EventQueueOptions;
    protected adapter: IEventQueueAdapter;
    protected events: Map<string, QueueEventOptions>;
    get channelPrefix(): string;
    constructor(app: Application, options?: EventQueueOptions);
    getFullChannel(channel: string, shared?: boolean): string;
    setAdapter<A extends IEventQueueAdapter>(adapter: A): void;
    isConnected(): boolean;
    connect(): Promise<void>;
    close(): Promise<void>;
    subscribe(channel: string, options: QueueEventOptions): void;
    unsubscribe(channel: string): void;
    publish(channel: string, message: any, options?: QueueMessageOptions): Promise<void>;
}
export default EventQueue;
