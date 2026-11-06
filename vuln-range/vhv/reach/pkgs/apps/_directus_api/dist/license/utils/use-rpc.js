import { useBus } from "../../bus/lib/use-bus.js";
import "../../bus/index.js";
import { useLogger } from "../../logger/index.js";
import { randomUUID } from "crypto";

//#region src/license/utils/use-rpc.ts
/**
* Call functions on other instances as if they were local (remote procedure call).
* The calling instance is skipped.
*/
async function useRPC(self, channel) {
	const uid = randomUUID();
	const messenger = useBus();
	const logger = useLogger();
	await messenger.subscribe(channel, async ({ uid: id, method, args }) => {
		if (uid == id) return;
		logger.debug(`RPC "${method}" received on "${channel}"`);
		const fn = self[method];
		if (typeof fn !== "function") {
			logger.warn(`Ignoring unknown RPC method "${method}" on "${channel}"`);
			return;
		}
		try {
			await fn.apply(self, args);
		} catch (error) {
			logger.warn(error, `RPC "${method}" on "${channel}" failed`);
		}
	});
	return new Proxy({}, { get(_, method) {
		if (typeof method !== "string" || method === "then") return void 0;
		return (...args) => messenger.publish(channel, {
			uid,
			method,
			args
		});
	} });
}

//#endregion
export { useRPC };