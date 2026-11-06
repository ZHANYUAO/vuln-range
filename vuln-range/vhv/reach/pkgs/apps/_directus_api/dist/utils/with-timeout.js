//#region src/utils/with-timeout.ts
/** Thrown when a timeout expires before the awaited promise settles */
var TimeoutError = class extends Error {
	name = "TimeoutError";
};
/**
* Resolves with `promise` when it settles before the timeout.
*
* @param promise Promise, or plain value, to wait for.
* @param ms How long to wait, in milliseconds. `Infinity` waits indefinitely.
* @param message Message for the timeout error
* @returns The result of `promise`.
* @throws When the timeout expires before `promise` settles or promise rejects
*/
function withTimeout(promise, ms, message) {
	if (!Number.isFinite(ms)) return Promise.resolve(promise);
	let expire;
	const expired = new Promise((_, reject) => expire = reject);
	const timer = setTimeout(() => expire(new TimeoutError(message ?? `Timeout of ${ms}ms exceeded`)), ms);
	return Promise.race([promise, expired]).finally(() => {
		clearTimeout(timer);
	});
}

//#endregion
export { TimeoutError, withTimeout };