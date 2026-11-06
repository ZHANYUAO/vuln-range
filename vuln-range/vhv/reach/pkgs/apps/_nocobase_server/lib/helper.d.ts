/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { Resourcer } from '@nocobase/resourcer';
import { Command } from 'commander';
import Application, { ApplicationOptions } from './application';
export declare function createI18n(options: ApplicationOptions): import("i18next").i18n;
export declare function createResourcer(options: ApplicationOptions): Resourcer;
export declare function resolveCorsOrigin(ctx: any): any;
export declare function registerMiddlewares(app: Application, options: ApplicationOptions): void;
export declare const createAppProxy: (app: Application) => Application<import("./application").DefaultState, import("./application").DefaultContext>;
export declare const getCommandFullName: (command: Command) => string;
export declare const tsxRerunning: () => Promise<void>;
export declare const enablePerfHooks: (app: Application) => void;
export declare function getBodyLimit(): string;
export declare function createContextVariablesScope(ctx: any): {
    timezone: any;
    now: string;
    getField: (path: any) => any;
    vars: {
        ctx: {
            state: any;
        };
        $system: {
            now: string;
        };
        $date: {
            now: string;
            today: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            yesterday: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            tomorrow: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            thisWeek: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            lastWeek: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            nextWeek: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            thisIsoWeek: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            lastIsoWeek: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            nextIsoWeek: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            thisMonth: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            lastMonth: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            nextMonth: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            thisQuarter: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            lastQuarter: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            nextQuarter: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            thisYear: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            lastYear: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            nextYear: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            last7Days: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => (string | number)[];
            next7Days: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => (string | number)[];
            last30Days: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => (string | number)[];
            next30Days: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => (string | number)[];
            last90Days: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => (string | number)[];
            next90Days: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => (string | number)[];
        };
        $nDate: {
            now: string;
            today: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            yesterday: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            tomorrow: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            thisWeek: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            lastWeek: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            nextWeek: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            thisIsoWeek: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            lastIsoWeek: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            nextIsoWeek: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            thisMonth: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            lastMonth: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            nextMonth: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            thisQuarter: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            lastQuarter: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            nextQuarter: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            thisYear: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            lastYear: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            nextYear: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => any;
            last7Days: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => (string | number)[];
            next7Days: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => (string | number)[];
            last30Days: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => (string | number)[];
            next30Days: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => (string | number)[];
            last90Days: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => (string | number)[];
            next90Days: ({ now, timezone, field }: {
                now?: any;
                timezone?: string | number;
                field?: {
                    timezone?: string | number;
                };
            }) => (string | number)[];
        };
        $user: ({ fields }: {
            fields: any;
        }) => Promise<any>;
        $nRole: any;
    };
};
