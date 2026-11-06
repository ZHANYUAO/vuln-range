/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { Command } from 'commander';
export declare class AppCommand extends Command {
    private _handleByIPCServer;
    _preload: boolean;
    ipc(): this;
    auth(): this;
    preload(): this;
    hasCommand(name: string): boolean;
    findCommand(name: string): any;
    isHandleByIPCServer(): boolean;
    createCommand(name?: string): AppCommand;
    parseHandleByIPCServer(argv: any, parseOptions?: any): Boolean;
}
