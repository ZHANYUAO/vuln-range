"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventProcessingResult = void 0;
class EventProcessingResult {
    // counts
    delivered = 0;
    opened = 0;
    temporaryFailed = 0;
    permanentFailed = 0;
    unsubscribed = 0;
    complained = 0;
    unhandled = 0;
    unprocessable = 0;
    // Newly populated newsletter recipient timestamps, excluding repeated events.
    storedDelivered = 0;
    storedOpened = 0;
    storedPermanentFailed = 0;
    // processing failures are counted separately in addition to event type counts
    processingFailures = 0;
    // ids seen whilst processing ready for passing to stats aggregator.
    // Only write these through merge() and reset() so they stay in step with the sets below.
    emailIds = [];
    memberIds = [];
    #emailIdSet = new Set();
    #memberIdSet = new Set();
    constructor(result = {}) {
        this.merge(result);
    }
    reset() {
        this.delivered = 0;
        this.opened = 0;
        this.temporaryFailed = 0;
        this.permanentFailed = 0;
        this.unsubscribed = 0;
        this.complained = 0;
        this.unhandled = 0;
        this.unprocessable = 0;
        this.storedDelivered = 0;
        this.storedOpened = 0;
        this.storedPermanentFailed = 0;
        this.processingFailures = 0;
        this.emailIds = [];
        this.memberIds = [];
        this.#emailIdSet.clear();
        this.#memberIdSet.clear();
    }
    merge(other = {}) {
        this.delivered += other.delivered || 0;
        this.opened += other.opened || 0;
        this.temporaryFailed += other.temporaryFailed || 0;
        this.permanentFailed += other.permanentFailed || 0;
        this.unsubscribed += other.unsubscribed || 0;
        this.complained += other.complained || 0;
        this.unhandled += other.unhandled || 0;
        this.unprocessable += other.unprocessable || 0;
        this.storedDelivered += other.storedDelivered || 0;
        this.storedOpened += other.storedOpened || 0;
        this.storedPermanentFailed += other.storedPermanentFailed || 0;
        this.processingFailures += other.processingFailures || 0;
        EventProcessingResult.#collect(this.#emailIdSet, this.emailIds, other.emailIds);
        EventProcessingResult.#collect(this.#memberIdSet, this.memberIds, other.memberIds);
    }
    // Only visit incoming IDs; rebuilding the accumulated arrays per event is quadratic.
    static #collect(seen, ordered, ids) {
        for (const id of ids ?? []) {
            if (id && !seen.has(id)) {
                seen.add(id);
                ordered.push(id);
            }
        }
    }
}
exports.EventProcessingResult = EventProcessingResult;
