//#region src/license/utils/compute-license-action.ts
/**
* Determine the license action to take
*
* | envKey | envToken |     dbKey     | dbToken | Outcome                                     | id |
* | ------ | -------- | ------------- | ------- | ------------------------------------------- | -- |
* |   y    |    y     |       *       |    *    | fatal - neither env var can win             | A  |
* |   y    |    n     | y (!= envKey) |    *    | update - env key replaces the persisted one | B  |
* |   y    |    n     | y (== envKey) |    y    | refresh - revalidate the persisted token    | C  |
* |   y    |    n     |       *       |    *    | activate - no token this key can use        | D  |
* |   n    |    y     |       *       |    *    | refresh - offline token, persisted ignored  | E  |
* |   n    |    n     |       y       |    y    | refresh - revalidate the persisted token    | F  |
* |   n    |    n     |       y       |    n    | activate - no token to revalidate           | G  |
* |   n    |    n     |       n       |    y    | clear-token - orphaned token, drop to core  | H  |
* |   n    |    n     |       n       |    n    | sync - already core, just propagate         | I  |
*/
function computeLicenseAction({ envKey, envToken, dbKey, dbToken }) {
	if (envKey && envToken) return {
		kind: "fatal",
		message: "LICENSE_KEY and LICENSE_TOKEN cannot both be set"
	};
	if (envKey) {
		if (dbKey && envKey !== dbKey) return {
			kind: "update",
			currentKey: dbKey,
			key: envKey
		};
		if (dbKey && dbToken) return {
			kind: "refresh",
			key: envKey,
			token: dbToken
		};
		return {
			kind: "activate",
			key: envKey
		};
	}
	if (envToken) return {
		kind: "refresh",
		key: null,
		token: envToken
	};
	if (dbKey) {
		if (dbToken) return {
			kind: "refresh",
			key: dbKey,
			token: dbToken
		};
		return {
			kind: "activate",
			key: dbKey
		};
	}
	if (dbToken) return { kind: "clear-token" };
	return { kind: "sync" };
}

//#endregion
export { computeLicenseAction };