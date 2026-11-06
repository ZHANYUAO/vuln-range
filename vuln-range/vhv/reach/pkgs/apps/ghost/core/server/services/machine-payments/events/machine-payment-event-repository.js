"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MachinePaymentEventRepository = void 0;
const errors_1 = __importDefault(require("@tryghost/errors"));
const machine_payment_event_1 = require("./machine-payment-event");
const isUniqueConstraintError = (err) => {
    const code = err?.code;
    return code === 'ER_DUP_ENTRY' || Boolean(code?.startsWith?.('SQLITE_CONSTRAINT'));
};
class MachinePaymentEventRepository {
    #Model;
    constructor({ MachinePaymentEventModel }) {
        this.#Model = MachinePaymentEventModel;
    }
    /**
     * @returns Promise resolving to the event and whether it was newly created
     */
    async save(data) {
        const event = machine_payment_event_1.MachinePaymentEvent.create(data);
        const existing = await this.#findByProtocolReference(event.protocol, event.reference);
        if (existing) {
            return { event: existing, created: false };
        }
        try {
            const created = await this.#Model.add({
                post_id: event.postId,
                amount: event.amount,
                currency: event.currency,
                protocol: event.protocol,
                method: event.method,
                stripe_payment_intent_id: event.stripePaymentIntentId,
                reference: event.reference,
                created_at: event.timestamp,
            }, { context: { internal: true } });
            return { event: created, created: true };
        }
        catch (err) {
            if (!isUniqueConstraintError(err)) {
                throw err;
            }
            const raced = await this.#findByProtocolReference(event.protocol, event.reference);
            if (raced) {
                return { event: raced, created: false };
            }
            throw new errors_1.default.InternalServerError({
                err: err instanceof Error ? err : undefined,
                message: 'Failed to persist machine payment event after unique constraint conflict',
            });
        }
    }
    async #findByProtocolReference(protocol, reference) {
        return await this.#Model.findOne({ protocol, reference });
    }
}
exports.MachinePaymentEventRepository = MachinePaymentEventRepository;
