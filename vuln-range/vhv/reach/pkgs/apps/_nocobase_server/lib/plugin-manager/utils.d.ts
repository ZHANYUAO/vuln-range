/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import { AxiosRequestConfig } from 'axios';
import { PluginManagerRepository } from './plugin-manager-repository';
import { PluginData } from './types';
import Application from '../application';
/**
 * get temp dir
 *
 * @example
 * getTempDir() => '/tmp/nocobase'
 */
export declare function getTempDir(): Promise<string>;
export declare function assertSafePluginPackageName(packageName: string): void;
export declare function resolveSafeChildPath(baseDir: string, child: string): string;
export declare function getLocalPluginPackagesPathArr(): string[];
export declare function getStoragePluginDir(packageName: string): string;
export declare function getLocalPluginDir(packageDirBasename: string): string;
export declare function getNodeModulesPluginDir(packageName: string): string;
export declare function getAuthorizationHeaders(registry?: string, authToken?: string): {};
/**
 * get latest version from npm
 *
 * @example
 * getLatestVersion('dayjs', 'https://registry.npmjs.org') => '1.10.6'
 */
export declare function getLatestVersion(packageName: string, registry: string, token?: string): Promise<any>;
export declare function getNpmInfo(packageName: string, registry: string, token?: string): Promise<any>;
export declare function download(url: string, destination: string, options?: AxiosRequestConfig): Promise<unknown>;
export declare function removeTmpDir(tempFile: string, tempPackageContentDir: string): Promise<void>;
/**
 * download and unzip to node_modules
 */
export declare function downloadAndUnzipToTempDir(fileUrl: string, authToken?: string): Promise<{
    packageName: any;
    version: any;
    tempPackageContentDir: string;
    tempFile: string;
}>;
export declare function copyTempPackageToStorageAndLinkToNodeModules(tempFile: string, tempPackageContentDir: string, packageName: string): Promise<{
    packageDir: string;
}>;
/**
 * get package info from npm
 *
 * @example
 * getPluginInfoByNpm('dayjs', 'https://registry.npmjs.org')
 * => { fileUrl: 'https://registry.npmjs.org/dayjs/-/dayjs-1.10.6.tgz', latestVersion: '1.10.6' }
 *
 * getPluginInfoByNpm('dayjs', 'https://registry.npmjs.org', '1.1.0')
 * => { fileUrl: 'https://registry.npmjs.org/dayjs/-/dayjs-1.1.0.tgz', latestVersion: '1.1.0' }
 */
interface GetPluginInfoOptions {
    packageName: string;
    registry: string;
    version?: string;
    authToken?: string;
}
export declare function getPluginInfoByNpm(options: GetPluginInfoOptions): Promise<{
    compressedFileUrl: string;
    version: string;
}>;
/**
 * scan `src/server` directory to get server packages
 *
 * @example
 * getServerPackages('src/server') => ['dayjs', '@nocobase/plugin-bbb']
 */
export declare function getServerPackages(packageDir: string): string[];
export declare function removePluginPackage(packageName: string): Promise<[void, void]>;
/**
 * get package.json
 *
 * @example
 * getPackageJson('dayjs') => { name: 'dayjs', version: '1.0.0', ... }
 */
export declare function getPackageJson(pluginName: string): Promise<any>;
export declare function getPackageJsonByLocalPath(localPath: string): Promise<any>;
export declare function updatePluginByCompressedFileUrl(options: Partial<Pick<PluginData, 'compressedFileUrl' | 'packageName' | 'authToken'>> & {
    repository: PluginManagerRepository;
}): Promise<{
    packageName: any;
    packageDir: string;
    version: any;
}>;
export declare function getNewVersion(plugin: PluginData): Promise<string | false>;
export declare function removeRequireCache(fileOrPackageName: string): void;
export declare function requireNoCache(fileOrPackageName: string): Promise<any>;
export declare function readJSONFileContent(filePath: string): Promise<any>;
export declare function requireModule(m: any): any;
export declare function isNotBuiltinModule(packageName: string): boolean;
export declare const isValidPackageName: (str: string) => boolean;
export declare function getPackageNameFromString(str: string): string;
export declare function getPackagesFromFiles(files: string[]): string[];
export declare function getIncludePackages(sourcePackages: string[], external: string[], pluginPrefix: string[]): string[];
export declare function getExcludePackages(sourcePackages: string[], external: string[], pluginPrefix: string[]): string[];
export declare function getExternalVersionFromSource(packageName: string): Promise<Record<string, string>>;
export interface DepCompatible {
    name: string;
    result: boolean;
    versionRange: string;
    packageVersion: string;
}
export declare function getCompatible(packageName: string): Promise<false | DepCompatible[]>;
export declare function checkCompatible(packageName: string): Promise<boolean>;
export declare function checkAndGetCompatible(packageName: string): Promise<{
    isCompatible: boolean;
    depsCompatible: DepCompatible[];
}>;
export declare function getPluginBasePath(packageName: string): Promise<string>;
export declare function pmListSummary(app: Application): Promise<{
    displayName: any;
    packageName: any;
    enabled: boolean;
    description: any;
}[]>;
export {};
