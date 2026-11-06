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
import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { Logger } from '@nocobase/logger';
import EventEmitter from 'events';
declare class WebSocketWithId extends WebSocket {
    id: string;
}
interface WebSocketClient {
    ws: WebSocketWithId;
    tags: Set<string>;
    url: string;
    headers: any;
    app?: string;
    id: string;
}
export declare class WSServer extends EventEmitter {
    wss: WebSocket.Server;
    webSocketClients: Map<string, WebSocketClient>;
    logger: Logger;
    constructor();
    bindAppWSEvents(app: any): void;
    addNewConnection(ws: WebSocketWithId, request: IncomingMessage): WebSocketClient;
    setClientTag(clientId: string, tagKey: string, tagValue: string): void;
    removeClientTag(clientId: string, tagKey: string): void;
    /**
     * Drop a connection whose url or headers resolve to an app name that can never exist. Closing beats tagging it with
     * the raw value: the tag would end up as a map key and would bootstrap an app on every selector change.
     */
    private rejectInvalidAppName;
    setClientApp(client: WebSocketClient): Promise<void>;
    removeConnection(id: string): void;
    sendMessageToConnection(client: WebSocketClient, sendMessage: object): void;
    sendToConnectionsByTag(tagName: string, tagValue: string, sendMessage: object): void;
    /**
     * Send message to clients that match all the given tag conditions
     * @param tags Array of tag conditions, each condition is an object with tagName and tagValue
     * @param sendMessage Message to be sent
     */
    sendToConnectionsByTags(tags: Array<{
        tagName: string;
        tagValue: string;
    }>, sendMessage: object): void;
    sendToClient(clientId: string, sendMessage: object): void;
    sendToAppUser(appName: string, userId: string, message: object): void;
    loopThroughConnections(callback: (client: WebSocketClient) => void): void;
    close(): void;
}
export {};
