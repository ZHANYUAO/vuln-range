/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
/// <reference types="node" />
import Application from './application';
export declare class AesEncryptor {
    private key;
    constructor(key: Buffer);
    encrypt(text: string): Promise<string>;
    decrypt(encryptedText: string): Promise<string>;
    decryptSync(encryptedText: string): string;
    static getOrGenerateKey(keyFilePath: string): Promise<Buffer>;
    static getKeyPath(appName: string): Promise<string>;
    static create(app: Application): Promise<AesEncryptor>;
}
export default AesEncryptor;
