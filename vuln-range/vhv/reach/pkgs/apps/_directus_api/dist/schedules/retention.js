import { useLogger } from "../logger/index.js";
import { getMilliseconds } from "../utils/get-milliseconds.js";
import { getHelpers } from "../database/helpers/index.js";
import database_default from "../database/index.js";
import { transaction } from "../utils/transaction.js";
import { runExclusive } from "../utils/run-exclusive.js";
import { scheduleSynchronizedJob, validateCron } from "../utils/schedule.js";
import { useEnv } from "@directus/env";
import { toBoolean } from "@directus/utils";
import { chunk, isNil } from "lodash-es";
import { Action } from "@directus/constants";

//#region src/schedules/retention.ts
async function handleRetentionJob(tasks, batch) {
	const database = database_default();
	const logger = useLogger();
	const helpers = getHelpers(database);
	const deleted = {
		activities: 0,
		revisions: 0
	};
	for (const task of tasks) {
		let records = [];
		do {
			const query = database.queryBuilder().select(`${task.collection}.id`).from(task.collection).where("directus_activity.timestamp", "<", helpers.date.parse(new Date(Date.now() - task.timeframe))).limit(batch);
			if (task.where) query.where(...task.where);
			if (task.join) query.join(...task.join);
			try {
				/**
				* Fetch IDs up front so all subsequent queries operate on the same rows.
				*
				* Using a subquery could result in different rows being selected. It is also not supported by MySQL/MariaDB.
				* https://dev.mysql.com/doc/refman/8.4/en/subquery-restrictions.html
				*/
				records = await query.then((r) => r.map((r$1) => r$1.id));
				if (records.length === 0) break;
				const removed = await transaction(database, async (trx) => {
					let revisionIds = records;
					if (task.collection === "directus_activity") revisionIds = await trx("directus_revisions").select("id").whereIn("activity", records).then((revisions) => revisions.map((revision) => revision.id));
					for (const ids of chunk(revisionIds, batch)) await trx("directus_revisions").update({ parent: null }).whereIn("parent", ids);
					const count = await trx(task.collection).whereIn("id", records).delete();
					return task.collection === "directus_activity" ? {
						activities: count,
						revisions: revisionIds.length
					} : {
						activities: 0,
						revisions: count
					};
				});
				deleted.activities += removed.activities;
				deleted.revisions += removed.revisions;
			} catch (error) {
				logger.error(error, `Retention failed for collection ${task.collection}`);
				break;
			}
		} while (records.length >= batch);
	}
	logger.debug(`Retention deleted ${deleted.activities} activities and ${deleted.revisions} revisions`);
}
/**
* Schedule the retention tracking
*
* @returns Whether or not retention has been initialized
*/
async function schedule() {
	const env = useEnv();
	const logger = useLogger();
	const cron = String(env["RETENTION_SCHEDULE"]);
	if (!toBoolean(env["RETENTION_ENABLED"])) return false;
	if (!validateCron(cron)) {
		logger.error(`Invalid RETENTION_SCHEDULE: "${cron}". Retention disabled.`);
		return false;
	}
	let batch = Number(env["RETENTION_BATCH"]);
	if (!Number.isInteger(batch) || batch < 1) {
		logger.error(`Invalid RETENTION_BATCH: "${env["RETENTION_BATCH"]}". Retention disabled.`);
		return false;
	}
	const activityTimeframe = getMilliseconds(env["ACTIVITY_RETENTION"]);
	const flowLogsTimeframe = getMilliseconds(env["FLOW_LOGS_RETENTION"]);
	const revisionsTimeframe = getMilliseconds(env["REVISIONS_RETENTION"]);
	const tasks = [];
	if (!isNil(activityTimeframe)) tasks.push({
		collection: "directus_activity",
		where: [
			"directus_activity.action",
			"!=",
			Action.RUN
		],
		timeframe: activityTimeframe
	});
	if (!isNil(flowLogsTimeframe)) tasks.push({
		collection: "directus_activity",
		where: [
			"directus_activity.action",
			"=",
			Action.RUN
		],
		timeframe: flowLogsTimeframe
	});
	if (!isNil(revisionsTimeframe) && (isNil(activityTimeframe) || activityTimeframe > revisionsTimeframe)) tasks.push({
		collection: "directus_revisions",
		join: [
			"directus_activity",
			"directus_revisions.activity",
			"directus_activity.id"
		],
		timeframe: revisionsTimeframe
	});
	if (tasks.length === 0) {
		logger.warn("No retention timeframes are set. Retention disabled.");
		return false;
	}
	const maxBatch = getHelpers(database_default()).capabilities.getMaxBindings() - 1;
	if (batch > maxBatch) {
		logger.warn(`"RETENTION_BATCH" value ${batch} exceeds the database limit. Using the maximum allowed value of ${maxBatch}`);
		batch = maxBatch;
	}
	scheduleSynchronizedJob("retention", cron, async () => {
		try {
			await runExclusive("retention", () => handleRetentionJob(tasks, batch), { timeout: Infinity });
		} catch (error) {
			logger.error(error, "Retention run failed");
		}
	});
	return true;
}

//#endregion
export { schedule as default, handleRetentionJob };