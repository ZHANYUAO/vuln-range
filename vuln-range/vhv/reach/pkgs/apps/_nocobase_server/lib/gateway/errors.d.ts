/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
/** Raised when a request resolves to an app name that could never name a real application. */
export declare class InvalidAppNameError extends Error {
    readonly appName: unknown;
    constructor(appName: unknown);
}
interface AppError {
    status: number;
    message: any;
    command?: any;
    maintaining: boolean;
    code: any;
}
interface AppErrors {
    [key: string]: Omit<AppError, 'code'> & {
        code?: any;
    };
}
export declare const errors: AppErrors;
export declare function getErrorWithCode(errorCode: string): AppError;
export declare function applyErrorWithArgs(error: AppError, options: any): {
    status: number;
    message: any;
    command?: any;
    maintaining: boolean;
    code: any;
};
export {};
