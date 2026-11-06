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
import { Logger } from '@nocobase/logger';
import * as events from 'events';
import net from 'net';
export declare const writeJSON: (socket: net.Socket, data: object) => void;
export declare class IPCSocketClient extends events.EventEmitter {
    client: net.Socket;
    logger: Logger;
    constructor(client: net.Socket);
    static getConnection(serverPath: string): Promise<IPCSocketClient>;
    handleServerMessage({ reqId, type, payload }: {
        reqId: any;
        type: any;
        payload: any;
    }): Promise<void>;
    close(): void;
    write(data: any): Promise<unknown>;
}
