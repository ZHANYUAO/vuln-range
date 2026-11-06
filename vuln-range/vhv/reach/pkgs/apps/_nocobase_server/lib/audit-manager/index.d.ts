/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { Context } from '@nocobase/actions';
export interface AuditLog {
    uuid: string;
    dataSource: string;
    resource: string;
    action: string;
    requestSource?: string;
    sourceCollection?: string;
    sourceRecordUK?: string;
    targetCollection?: string;
    targetRecordUK?: string;
    userId: string;
    roleName: string;
    ip: string;
    ua: string;
    status: number;
    metadata?: Record<string, any>;
}
export interface UserInfo {
    userId?: string;
    roleName?: string;
}
export interface SourceAndTarget {
    sourceCollection?: string;
    sourceRecordUK?: string;
    targetCollection?: string;
    targetRecordUK?: string;
}
export interface AuditLogger {
    log(auditLog: AuditLog): Promise<void>;
}
type Action = string | {
    name: string;
    getMetaData?: (ctx: Context) => Promise<Record<string, any>>;
    getUserInfo?: (ctx: Context) => Promise<UserInfo>;
    getSourceAndTarget?: (ctx: Context) => Promise<SourceAndTarget>;
};
export declare class AuditManager {
    logger: AuditLogger;
    resources: Map<string, Map<string, Action>>;
    constructor();
    setLogger(logger: AuditLogger): void;
    /**
     * 注册需要参与审计的资源和操作，支持几种写法
     *
     * 对所有资源生效；
     * registerActions(['create'])
     *
     * 对某个资源的所有操作生效 resource:*
     * registerActions(['app:*'])
     *
     * 对某个资源的某个操作生效 resouce:action
     * registerAction(['pm:update'])
     *
     * 支持传getMetaData方法
     *
     * registerActions([
     *  'create',
     *  { name: 'auth:signIn', getMetaData}
     * ])
     *
     * 支持传getUserInfo方法
     *
     * registerActions([
     * 'create',
     * { name: 'auth:signIn', getUserInfo }
     * ])
     *
     * 当注册的接口有重叠时，颗粒度细的注册方法优先级更高
     *
     * Action1: registerActions(['create']);
     *
     * Action2: registerAction([{ name: 'user:*', getMetaData }]);
     *
     * Action3: registerAction([{ name: 'user:create', getMetaData }]);
     *
     * 对于user:create接口，以上优先级顺序是 Action3 > Action2 > Action1
     *
     * @param actions 操作列表
     */
    registerActions(actions: Action[]): void;
    /**
     * 注册单个操作，支持的用法同registerActions
     * @param action 操作
     */
    registerAction(action: Action): void;
    getAction(action: string, resource?: string): Action;
    getDefaultMetaData(ctx: any): Promise<{
        request: {
            params: any;
            query: any;
            body: any;
            path: any;
            headers: {
                'x-authenticator': any;
                'x-locale': any;
                'x-timezone': any;
                'x-request-source': any;
            };
        };
        response: {
            body: any;
        };
    }>;
    formatAuditData(ctx: Context): AuditLog;
    output(ctx: any, reqId: any, metadata?: Record<string, any>): Promise<void>;
    middleware(): (ctx: any, next: any) => Promise<void>;
}
export {};
