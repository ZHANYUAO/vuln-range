"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxRelay = void 0;
const errors_1 = __importDefault(require("@tryghost/errors"));
class OutboxRelay {
    #outbox;
    #backend;
    #logging;
    #sentry;
    #pollIntervalMs;
    #submissionTimeoutMs;
    #retryDelayMs;
    #running = false;
    #loop;
    #wake;
    constructor({ outbox, backend, logging, sentry, pollIntervalMs, submissionTimeoutMs, retryDelayMs, }) {
        this.#outbox = outbox;
        this.#backend = backend;
        this.#logging = logging;
        this.#sentry = sentry;
        this.#pollIntervalMs = pollIntervalMs;
        this.#submissionTimeoutMs = submissionTimeoutMs;
        this.#retryDelayMs = retryDelayMs;
    }
    start() {
        if (this.#running) {
            return;
        }
        this.#running = true;
        this.#loop = this.#run();
    }
    async stop() {
        this.#running = false;
        this.#wake?.();
        await this.#loop;
        this.#loop = undefined;
    }
    async #run() {
        while (this.#running) {
            await this.#drain();
            if (!this.#running) {
                break;
            }
            await this.#sleep(this.#pollIntervalMs);
        }
    }
    async #drain() {
        while (this.#running) {
            let outcome;
            try {
                outcome = await this.#outbox.processNext((id, envelope) => this.#submit(id, envelope), {
                    retryDelayMs: this.#retryDelayMs,
                });
            }
            catch (error) {
                this.#logging.error('[Jobs Outbox] relay failed while processing a row; it stays in the outbox and will be retried', error);
                this.#sentry?.captureException(error);
                return;
            }
            if (outcome.status === 'idle') {
                return;
            }
            if (outcome.status === 'failed') {
                this.#logging.error(`[Jobs Outbox] submission failed for dispatch ${outcome.id}; retrying later`, outcome.error);
                this.#sentry?.captureException(outcome.error, { tags: { dispatch_id: outcome.id } });
            }
        }
    }
    #submit(id, envelope) {
        const submission = Promise.resolve(this.#backend.enqueue(id, envelope));
        let timer;
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(() => {
                reject(new errors_1.default.InternalServerError({
                    message: `Jobs outbox submission timed out after ${this.#submissionTimeoutMs}ms`,
                }));
            }, this.#submissionTimeoutMs);
        });
        return Promise.race([submission, timeout]).finally(() => {
            clearTimeout(timer);
        });
    }
    #sleep(ms) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.#wake = undefined;
                resolve();
            }, ms);
            this.#wake = () => {
                clearTimeout(timer);
                this.#wake = undefined;
                resolve();
            };
        });
    }
}
exports.OutboxRelay = OutboxRelay;
