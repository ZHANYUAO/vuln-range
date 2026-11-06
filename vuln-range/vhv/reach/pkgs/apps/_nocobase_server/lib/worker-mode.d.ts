/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
/**
 * Check if the application is running in transient mode (WORKER_MODE === '-'),
 * which means it is a short-lived subprocess spawned to execute a command and then exit.
 * @experimental
 */
export declare function isTransient(): boolean;
/**
 * Check if the application is serving as a specific worker.
 * @experimental
 */
export declare function serving(key?: string): boolean;
