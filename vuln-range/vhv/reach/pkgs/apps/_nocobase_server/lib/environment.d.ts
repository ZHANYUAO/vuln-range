/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
export declare class Environment {
    private vars;
    private secretKeys;
    setVariable(key: string, value: string, options?: {
        isSecret?: boolean;
    }): void;
    removeVariable(key: string): void;
    getVariablesAndSecrets(): {};
    getVariables(): {};
    getNonSecretVariables(): {};
    renderJsonTemplate(template: any, options?: {
        omit?: string[];
    }): any;
}
