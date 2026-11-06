/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
/// <reference types="node" />
import { IncomingMessage } from 'http';
import { IncomingRequest } from '.';
export declare const MODERN_CLIENT_DIST_DIR = "v";
export declare function resolvePublicPath(appPublicPath?: string): string;
export declare function normalizeModernClientPrefix(value?: string): string;
export declare function resolveV2PublicPath(appPublicPath?: string): string;
export declare function rewriteV2AssetPublicPath(html: string, assetPublicPath: string): string;
export declare function injectRuntimeScript(html: string, runtimeScript: string): string;
export declare function getHost(req: IncomingMessage | IncomingRequest): any;
export declare function getHostname(req: IncomingMessage | IncomingRequest): any;
