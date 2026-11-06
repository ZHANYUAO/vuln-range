//#region src/utils/is-admin.ts
/**
* True for the system (`null`) and for an admin accountability.
*
* The predicate only describes the positive case, so the negative branch narrows to a plain,
* non-null `Accountability`.
*/
function isAdmin(accountability) {
	if (accountability === null) return true;
	if (accountability?.admin === true) return true;
	return false;
}

//#endregion
export { isAdmin };