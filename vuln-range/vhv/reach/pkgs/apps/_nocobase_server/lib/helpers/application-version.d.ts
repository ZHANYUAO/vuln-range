/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { Collection } from '@nocobase/database';
import Application from '../application';
export declare class ApplicationVersion {
    protected app: Application;
    protected collection: Collection;
    constructor(app: Application);
    get(): Promise<any>;
    update(version?: string): Promise<void>;
    satisfies(range: string): Promise<boolean>;
}
