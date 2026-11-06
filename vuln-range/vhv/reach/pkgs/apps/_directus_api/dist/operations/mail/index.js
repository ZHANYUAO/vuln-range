import { useLogger } from "../../logger/index.js";
import { md } from "../../utils/md.js";
import { MailService } from "../../services/mail/index.js";
import { useFlowsEmailRateLimiter } from "./rate-limiter.js";
import { useEnv } from "@directus/env";
import { defineOperationApi } from "@directus/extensions";

//#region src/operations/mail/index.ts
const logger = useLogger();
var mail_default = defineOperationApi({
	id: "mail",
	handler: async ({ body, template, data, to, fromName, type, subject, cc, bcc, replyTo }, { accountability, database, getSchema, flow }) => {
		await useFlowsEmailRateLimiter(flow.id);
		const env = useEnv();
		const mailService = new MailService({
			schema: await getSchema({ database }),
			accountability,
			knex: database
		});
		const mailObject = {
			to,
			subject,
			cc,
			bcc,
			replyTo
		};
		const trimmedFromName = typeof fromName === "string" ? fromName.trim() : void 0;
		if (trimmedFromName) mailObject.from = {
			name: trimmedFromName,
			address: env["EMAIL_FROM"]
		};
		const safeBody = typeof body !== "string" ? JSON.stringify(body) : body;
		if (type === "template") mailObject.template = {
			name: template || "base",
			data: data || {}
		};
		else mailObject.html = type === "wysiwyg" ? safeBody : md(safeBody);
		mailService.send(mailObject).catch((error) => {
			logger.error(error, "Could not send mail in \"mail\" operation");
		});
	}
});

//#endregion
export { mail_default as default };