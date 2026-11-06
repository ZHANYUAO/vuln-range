/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
/// <reference types="node" />
import net from 'net';
export declare class IPCSocketServer {
    socketServer: net.Server;
    constructor(server: net.Server);
    static buildServer(socketPath: string): IPCSocketServer;
    static handleClientMessage({ reqId, type, payload }: {
        reqId: any;
        type: any;
        payload: any;
    }): Promise<string | false | import("../app-command").AppCommand>;
    close(): void;
}
