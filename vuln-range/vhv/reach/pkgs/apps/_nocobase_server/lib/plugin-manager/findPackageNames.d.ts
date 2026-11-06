/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
declare function trim(packageNames: string[]): Promise<string[]>;
export declare function findPackageNames(): Promise<string[]>;
export declare function findBuiltInPlugins(): Promise<string[]>;
export declare function findLocalPlugins(): Promise<string[]>;
export declare function findAllPlugins(): Promise<string[]>;
export declare const packageNameTrim: typeof trim;
export declare function appendToBuiltInPlugins(nameOrPkg: string): Promise<void>;
export {};
