import { useLogger } from "../logger/index.js";
import { isDirectusError } from "@directus/errors";
import { fromZodError } from "zod-validation-error";
import { ZodError } from "zod";

//#region src/websocket/errors.ts
var WebSocketError = class WebSocketError extends Error {
	type;
	code;
	uid;
	constructor(type, code, message, uid) {
		super(message);
		this.type = type;
		this.code = code;
		this.uid = uid;
	}
	toJSON() {
		const message = {
			type: this.type,
			status: "error",
			error: {
				code: this.code,
				message: this.message
			}
		};
		if (this.uid !== void 0) message.uid = this.uid;
		return message;
	}
	toMessage() {
		return JSON.stringify(this.toJSON());
	}
	static fromError(error, type = "unknown", uid) {
		return new WebSocketError(type, error.code, error.message, uid);
	}
	static fromZodError(error, type = "unknown", uid) {
		return new WebSocketError(type, "INVALID_PAYLOAD", fromZodError(error).message, uid);
	}
};
/**
* Send an error to the client
*
* Pass the `uid` of the message being handled so the client can tie the error back to it. A
* WebSocketError carries its own uid and ignores the one passed here
*/
function handleWebSocketError(client, error, options = {}) {
	const { type, uid } = options;
	const logger = useLogger();
	if (isDirectusError(error)) {
		client.send(WebSocketError.fromError(error, type, uid).toMessage());
		return;
	}
	if (error instanceof WebSocketError) {
		client.send(error.toMessage());
		return;
	}
	if (error instanceof ZodError) {
		client.send(WebSocketError.fromZodError(error, type, uid).toMessage());
		return;
	}
	logger.error(`WebSocket unhandled exception ${JSON.stringify({
		type,
		error
	})}`);
}

//#endregion
export { WebSocketError, handleWebSocketError };