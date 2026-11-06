"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pricing = exports.DEFAULT_CURRENCY = exports.DEFAULT_AMOUNT = void 0;
const errors_1 = __importDefault(require("@tryghost/errors"));
exports.DEFAULT_AMOUNT = 100;
exports.DEFAULT_CURRENCY = 'USD';
class Pricing {
    settingsCache;
    defaultCurrencyProvider;
    constructor({ settingsCache, defaultCurrencyProvider }) {
        this.settingsCache = settingsCache;
        this.defaultCurrencyProvider = defaultCurrencyProvider;
    }
    async getTerms() {
        const configuredAmount = this.settingsCache.get('machine_payments_amount');
        const amount = Number(configuredAmount === null || configuredAmount === undefined
            ? exports.DEFAULT_AMOUNT
            : configuredAmount);
        this.assertValidAmount(amount);
        const configuredCurrency = this.settingsCache.get('machine_payments_currency');
        const currency = String(configuredCurrency || (await this.defaultCurrencyProvider?.()) || exports.DEFAULT_CURRENCY).toUpperCase();
        return { amount, currency };
    }
    /**
     * SPT/card rails use configured fiat. Tempo USDC uses the same minor-unit
     * amount as a USDC charge (documented product fence — not FX conversion).
     */
    forSpt(terms) {
        return {
            amount: terms.amount,
            currency: terms.currency.toLowerCase(),
            majorAmount: (terms.amount / 100).toFixed(2),
        };
    }
    forTempoUsdc(terms) {
        return {
            amount: terms.amount,
            majorAmount: (terms.amount / 100).toFixed(2),
        };
    }
    assertValidAmount(amount) {
        if (!Number.isSafeInteger(amount) || amount < 1) {
            throw new errors_1.default.ValidationError({
                message: 'Machine payments amount must be an integer greater than 0',
            });
        }
    }
}
exports.Pricing = Pricing;
