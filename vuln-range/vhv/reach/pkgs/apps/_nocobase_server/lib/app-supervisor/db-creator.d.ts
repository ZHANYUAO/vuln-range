/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { Predicate } from './condition-registry';
import type { AppDbCreator, AppDbCreatorOptions } from './types';
export declare const createDatabaseCondition: Predicate<AppDbCreatorOptions>;
export declare const createConnectionCondition: Predicate<AppDbCreatorOptions>;
export declare const createSchemaCondition: Predicate<AppDbCreatorOptions>;
export declare const createDatabase: AppDbCreator;
export declare const createConnection: AppDbCreator;
export declare const createSchema: AppDbCreator;
