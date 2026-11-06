/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { CronJob, CronJobParameters } from 'cron';
import Application from '../application';
export declare class CronJobManager {
    private app;
    private _jobs;
    private _started;
    constructor(app: Application);
    get started(): boolean;
    get jobs(): Set<CronJob>;
    addJob(options: CronJobParameters): CronJob;
    removeJob(job: CronJob): void;
    start(): void;
    stop(): void;
}
