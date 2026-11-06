import path from "node:path";

//#region src/utils/is-within-path.ts
/**
* Check whether a path is a directory or contained within it, to prevent path traversal.
*
* Relative paths are resolved against the cwd, so an empty `dirpath` contains every relative path.
*
* @param filepath Path to check
* @param dirpath Directory the path should be contained in
*/
function isWithinPath(filepath, dirpath) {
	const relative$1 = path.relative(dirpath, filepath);
	return relative$1 !== ".." && relative$1.startsWith(".." + path.sep) === false && path.isAbsolute(relative$1) === false;
}

//#endregion
export { isWithinPath };