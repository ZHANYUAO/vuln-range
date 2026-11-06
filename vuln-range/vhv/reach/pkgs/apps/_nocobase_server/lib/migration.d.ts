/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { Migration as DbMigration } from '@nocobase/database';
import Application from './application';
import Plugin from './plugin';
import { PluginManager } from './plugin-manager';
export declare class Migration extends DbMigration {
    appVersion: string;
    pluginVersion: string;
    on: string;
    get app(): Application<import("./application").DefaultState, import("./application").DefaultContext>;
    get pm(): PluginManager;
    get plugin(): Plugin<any>;
}
