/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { CacheManagerOptions, CacheManager } from '@nocobase/cache';
import Application from '../application';
export declare const createCacheManager: (app: Application, options: CacheManagerOptions) => Promise<CacheManager>;
