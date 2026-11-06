"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MachinePaymentEvent = void 0;
const errors_1 = __importDefault(require("@tryghost/errors"));
class MachinePaymentEvent {
    timestamp;
    postId;
    amount;
    currency;
    protocol;
    method;
    stripePaymentIntentId;
    reference;
    constructor(data, timestamp) {
        this.timestamp = timestamp;
        this.postId = data.postId;
        this.amount = data.amount;
        this.currency = data.currency;
        this.protocol = data.protocol;
        this.method = data.method;
        this.stripePaymentIntentId = data.stripePaymentIntentId ?? null;
        this.reference = data.reference;
    }
    static create(data, timestamp) {
        const required = [
            'postId',
            'amount',
            'currency',
            'protocol',
            'method',
            'reference',
        ];
        for (const key of required) {
            if (data?.[key] === undefined || data?.[key] === null || data?.[key] === '') {
                throw new errors_1.default.ValidationError({
                    message: `MachinePaymentEvent.${key} is required`,
                });
            }
        }
        return new MachinePaymentEvent(data, timestamp ?? new Date());
    }
}
exports.MachinePaymentEvent = MachinePaymentEvent;
