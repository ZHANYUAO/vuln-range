/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
export type Predicate<C> = (ctx: C) => boolean | Promise<boolean>;
type Handler<C, R> = (ctx: C) => R | Promise<R>;
export declare class ConditionalRegistry<C, R> {
    private rules;
    private defaultHandler?;
    register(when: Predicate<C>, run: Handler<C, R>, priority?: number): void;
    setDefault(run: Handler<C, R>): void;
    run(ctx: C): Promise<R>;
}
export {};
