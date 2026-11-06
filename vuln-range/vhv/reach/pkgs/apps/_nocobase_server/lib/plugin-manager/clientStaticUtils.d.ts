/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
export declare const PLUGIN_STATICS_PATH = "/static/plugins/";
/**
 * get package.json path for specific NPM package
 */
export declare function getDepPkgPath(packageName: string, cwd?: string): string;
export declare function getPackageDir(packageName: string): string;
export declare function getPackageFilePath(packageName: string, filePath: string): string;
export declare function getPackageFilePathWithExistCheck(packageName: string, filePath: string): {
    filePath: string;
    exists: boolean;
};
export declare function getExposeUrl(packageName: string, filePath: string): string;
export declare function getExposeReadmeUrl(packageName: string, lang: string): string;
export declare function getExposeChangelogUrl(packageName: string): string;
/**
 * get package name by client static url
 *
 * @example
 * getPluginNameByClientStaticUrl('/static/plugins/dayjs/index.js') => 'dayjs'
 * getPluginNameByClientStaticUrl('/static/plugins/@nocobase/foo/README.md') => '@nocobase/foo'
 */
export declare function getPackageNameByExposeUrl(pathname: string): string;
export declare function getPackageDirByExposeUrl(pathname: string): string;
