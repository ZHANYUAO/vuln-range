import { useBus } from "../bus/lib/use-bus.js";
import "../bus/index.js";
import { useLogger } from "../logger/index.js";
import { useLock } from "../lock/lib/use-lock.js";
import "../lock/index.js";
import { TimeoutError, withTimeout } from "./with-timeout.js";

//#region src/utils/run-exclusive.ts
/** Runs in flight in this process, so concurrent local callers share one election */
const inflight = /* @__PURE__ */ new Map();
/**
* Runs `fn` once across all instances for the given key.
* One caller takes the lock and executes `fn`, the rest wait for its outcome.
*
* Not a guarantee: a leader that loses its lock mid-run is replaced while its `fn` carries on,
* so `fn` should be idempotent
*
* @param key Key identifying the exclusive operation.
* @param fn Function to execute.
* @param options Execution options.
* @returns The outcome of `fn` and whether this invocation executed it.
*/
function runExclusive(key, fn, options) {
	const existing = inflight.get(key);
	if (existing) return existing.then(({ result }) => ({
		result,
		leader: false
	}));
	const timeout = options?.timeout ?? 3e5;
	const expired = `Exclusive run "${key}" timed out after ${timeout}ms`;
	const pending = withTimeout(new ExclusiveRun(key, fn, {
		timeout,
		lease: options?.lease ?? 15e3,
		expired
	}).run(), timeout, expired).finally(() => inflight.delete(key));
	inflight.set(key, pending);
	return pending;
}
var ExclusiveRun = class {
	bus = useBus();
	lock = useLock();
	logger = useLogger();
	/** Bus channel the leader publishes the outcome on */
	channel;
	/** When the run should stop, as a timestamp in ms */
	deadline;
	/** How long the lock lasts without a refresh, in ms */
	lease;
	/** Error message for a run that hit its deadline */
	expired;
	/** Whether an outcome has already arrived on the bus */
	received = false;
	constructor(key, fn, options) {
		this.key = key;
		this.fn = fn;
		this.channel = `exclusive:${key}`;
		this.deadline = Date.now() + options.timeout;
		this.lease = options.lease;
		this.expired = options.expired;
	}
	/**
	* Attempt to run the function as leader, if already running, wait for the result
	*/
	async run() {
		let followed = false;
		let deliver;
		const published = new Promise((resolve) => deliver = resolve);
		const onMessage = (outcome) => {
			this.received = true;
			deliver(outcome);
		};
		await this.bus.subscribe(this.channel, onMessage);
		try {
			while (true) {
				const led = await this.tryLead();
				if (led) {
					if (followed) this.logger.warn(`Exclusive run "${this.key}" taken over: no outcome from previous leader`);
					if (!led.ok) throw led.error;
					return {
						result: led.result,
						leader: true
					};
				}
				followed = true;
				const outcome = await withTimeout(published, Math.min(this.lease, this.remaining())).catch(() => {});
				if (outcome) {
					if (!outcome.ok) throw outcome.error === this.expired ? new TimeoutError(outcome.error) : new Error(outcome.error);
					return {
						result: outcome.result,
						leader: false
					};
				}
				if (this.remaining() <= 0) throw new TimeoutError(this.expired);
			}
		} finally {
			await this.bus.unsubscribe(this.channel, onMessage).catch((error) => {
				this.logger.warn(error, `Exclusive run "${this.key}" could not unsubscribe`);
			});
		}
	}
	/**
	* Attempt to lead (i.e. execute `fn`)
	*
	* @returns the outcome of `fn`, or `undefined` when someone else holds the lock
	*/
	async tryLead() {
		let outcome;
		try {
			await this.lock.usingLock(this.key, async (signal) => {
				if (this.received || this.remaining() <= 0) return;
				outcome = await this.runFn(signal);
			}, {
				duration: this.lease,
				retryCount: 0
			});
		} catch (error) {
			this.logger.debug(error, `Exclusive run "${this.key}" did not get the lock`);
		}
		return outcome;
	}
	/**
	* Runs `fn` while holding the lock, and shares its outcome if still leading
	*
	* @returns the outcome of `fn`
	*/
	async runFn(signal) {
		let outcome;
		try {
			outcome = {
				ok: true,
				result: await withTimeout(this.fn(), this.remaining(), this.expired)
			};
		} catch (error) {
			outcome = {
				ok: false,
				error
			};
		}
		if (signal.aborted) {
			this.logger.warn(`Exclusive run "${this.key}" lost its lock before finishing`);
			return outcome;
		}
		const message = outcome.ok ? outcome : {
			ok: false,
			error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error)
		};
		await this.bus.publish(this.channel, message).catch((error) => {
			this.logger.warn(error, `Exclusive run "${this.key}" could not publish its outcome`);
		});
		return outcome;
	}
	/** Time left before the deadline, in ms */
	remaining() {
		return this.deadline - Date.now();
	}
};

//#endregion
export { inflight, runExclusive };