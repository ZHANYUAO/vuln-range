"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SigningKeyService = exports.GRACE_PERIOD_MS = exports.PUBLISH_DELAY_MS = exports.MIN_MODULUS_LENGTH = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_util_1 = require("node:util");
const zod_1 = require("zod");
const errors = __importStar(require("@tryghost/errors"));
const public_jwk_1 = require("../../lib/public-jwk");
const date_1 = require("../../lib/db-types/date");
const KeySetting = zod_1.z.object({
    value: zod_1.z.string().nullable(),
    created_at: date_1.DbDate,
    updated_at: date_1.DbDate.nullish(),
});
/** A key setting from the settings cache or a Settings model; null when the row is missing. */
function parseKeySetting(key, data) {
    if (data === undefined || data === null) {
        return null;
    }
    const result = KeySetting.safeParse(data);
    if (!result.success) {
        throw new errors.InternalServerError({
            message: `Invalid signing key setting: ${key}`,
            context: zod_1.z.prettifyError(result.error),
        });
    }
    const { value, created_at: createdAt, updated_at: updatedAt } = result.data;
    return { value, changedAt: updatedAt ?? createdAt };
}
const HOUR = 60 * 60 * 1000;
exports.MIN_MODULUS_LENGTH = 2048;
// Twice the 24h JWKS cache, so verifiers have the next key before it signs anything
exports.PUBLISH_DELAY_MS = 48 * HOUR;
// Covers tokens (<=10m) signed by an instance whose settings haven't caught up yet
exports.GRACE_PERIOD_MS = 2 * HOUR;
const SETTING_PREFIX = {
    members: 'members',
    staff: 'ghost',
};
const PURPOSES = ['members', 'staff'];
function settingKeys(purpose) {
    const prefix = SETTING_PREFIX[purpose];
    return {
        active: `${prefix}_private_key`,
        activePublic: `${prefix}_public_key`,
        next: `${prefix}_next_private_key`,
        previous: `${prefix}_previous_public_key`,
    };
}
const generateKeyPair = (0, node_util_1.promisify)(node_crypto_1.default.generateKeyPair);
async function generateKeypair() {
    // PKCS#1 PEM, matching the format of existing keys
    return generateKeyPair('rsa', {
        modulusLength: exports.MIN_MODULUS_LENGTH,
        publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
}
// Only for private PEMs: Node 24.20+ can't re-export a key parsed from a PKCS#1 public PEM
function toPublicPem(privateKey) {
    return node_crypto_1.default.createPublicKey(privateKey).export({ type: 'pkcs1', format: 'pem' }).toString();
}
function modulusLength(privateKey) {
    return node_crypto_1.default.createPrivateKey(privateKey).asymmetricKeyDetails?.modulusLength ?? 0;
}
/**
 * Rotates the site signing keypairs, which live in settings so older Ghost
 * versions keep reading the active key.
 *
 * A new key is published in the JWKS for PUBLISH_DELAY_MS before it signs
 * anything; after the switch the old public key stays published for
 * GRACE_PERIOD_MS. Every write re-checks the rows it replaces under a lock, so
 * instances sharing a database can't publish or promote two different keys.
 */
class SigningKeyService {
    settingsCache;
    Settings;
    transaction;
    logging;
    generateKeypair;
    onRotationStarted;
    constructor({ settingsCache, Settings, transaction, logging, generateKeypair: generate = generateKeypair, onRotationStarted, }) {
        this.settingsCache = settingsCache;
        this.Settings = Settings;
        this.transaction = transaction;
        this.logging = logging;
        this.generateKeypair = generate;
        this.onRotationStarted = onRotationStarted;
    }
    /** Advances any rotation that's due, and starts one for keys under 2048 bits. */
    async check() {
        for (const purpose of PURPOSES) {
            await this.retirePrevious(purpose);
            await this.promoteNext(purpose);
            const { active, next } = this.getState(purpose);
            if (active && !next && modulusLength(active) < exports.MIN_MODULUS_LENGTH) {
                await this.rotate(purpose);
            }
        }
    }
    /**
     * Publishes a new key for `purpose`, which starts signing once it's been
     * published for PUBLISH_DELAY_MS. Returns false if a new key is already pending.
     */
    async rotate(purpose) {
        const k = settingKeys(purpose);
        const { privateKey } = await this.generateKeypair();
        const started = await this.update({ [k.next]: null }, { [k.next]: privateKey });
        this.logging.info(started
            ? `Signing keys: published a new ${purpose} key`
            : `Signing keys: a new ${purpose} key is already published`);
        if (started) {
            await this.onRotationStarted?.();
        }
        return started;
    }
    /** Whether any key still has a rotation step ahead of it. */
    isRotating() {
        return PURPOSES.some((purpose) => {
            const { active, next, previous } = this.getState(purpose);
            return !!next || !!previous || (!!active && modulusLength(active) < exports.MIN_MODULUS_LENGTH);
        });
    }
    forPurpose(purpose) {
        return {
            getSigningKey: () => this.getSigningKey(purpose),
            getVerificationKey: (kid) => this.getVerificationKey(purpose, kid),
            getJwks: () => this.getJwks(purpose),
        };
    }
    async getSigningKey(purpose) {
        const privateKey = this.getState(purpose).active;
        if (!privateKey) {
            throw new errors.IncorrectUsageError({ message: `No ${purpose} signing key` });
        }
        const { kid } = await (0, public_jwk_1.getPublicKeyInfo)(privateKey);
        return { privateKey, kid };
    }
    async getVerificationKey(purpose, kid) {
        const keys = await this.getVerificationKeys(purpose);
        return (keys.find((key) => key.kid === kid) ?? keys[0]).publicKey;
    }
    async getJwks(purpose) {
        const keys = await this.getVerificationKeys(purpose);
        return {
            keys: keys.map(({ kid, jwk }) => ({ e: jwk.e, kid, kty: jwk.kty, n: jwk.n, use: 'sig' })),
        };
    }
    /** Every published key, the signing key first. */
    async getVerificationKeys(purpose) {
        const { active, next, previous } = this.getState(purpose);
        const fromPrivate = [active, next?.privateKey]
            .filter((pem) => !!pem)
            .map(async (privateKey) => ({
            ...(await (0, public_jwk_1.getPublicKeyInfo)(privateKey)),
            publicKey: toPublicPem(privateKey),
        }));
        const fromPublic = previous
            ? [
                (0, public_jwk_1.getPublicKeyInfoFromPublicKey)(previous.publicKey).then((info) => ({
                    ...info,
                    publicKey: previous.publicKey,
                })),
            ]
            : [];
        return Promise.all([...fromPrivate, ...fromPublic]);
    }
    getState(purpose) {
        const k = settingKeys(purpose);
        const setting = (key) => {
            const parsed = parseKeySetting(key, this.settingsCache.get(key, { resolve: false }));
            return parsed?.value ? { value: parsed.value, changedAt: parsed.changedAt } : null;
        };
        const next = setting(k.next);
        const previous = setting(k.previous);
        return {
            active: setting(k.active)?.value ?? null,
            next: next && { privateKey: next.value, publishedAt: next.changedAt },
            previous: previous && { publicKey: previous.value, since: previous.changedAt },
        };
    }
    /**
     * Applies `changes` only if every setting in `expected` still holds its value and
     * `due.key` was written at least `due.after` ms ago, both read from the locked rows.
     */
    update(expected, changes, due) {
        return this.transaction(async (transacting) => {
            for (const [key, value] of Object.entries(expected)) {
                const row = await this.Settings.findOne({ key }, { transacting, forUpdate: true });
                const setting = parseKeySetting(key, row?.toJSON());
                if ((setting?.value ?? null) !== value) {
                    return false;
                }
                if (setting && due?.key === key && Date.now() - setting.changedAt.getTime() < due.after) {
                    return false;
                }
            }
            await this.Settings.edit(Object.entries(changes).map(([key, value]) => ({ key, value })), { transacting, context: { internal: true } });
            return true;
        });
    }
    async retirePrevious(purpose) {
        const { previous } = this.getState(purpose);
        if (!previous || Date.now() - previous.since.getTime() < exports.GRACE_PERIOD_MS) {
            return;
        }
        const k = settingKeys(purpose);
        const retired = await this.update({ [k.previous]: previous.publicKey }, { [k.previous]: null }, { key: k.previous, after: exports.GRACE_PERIOD_MS });
        this.logging.info(retired
            ? `Signing keys: retired previous ${purpose} key`
            : `Signing keys: previous ${purpose} key already retired or not due`);
    }
    async promoteNext(purpose) {
        const { active, next } = this.getState(purpose);
        if (!next || Date.now() - next.publishedAt.getTime() < exports.PUBLISH_DELAY_MS) {
            return;
        }
        if (!active) {
            this.logging.warn(`Signing keys: no active ${purpose} key to replace`);
            return;
        }
        const k = settingKeys(purpose);
        const promoted = await this.update({ [k.active]: active, [k.next]: next.privateKey }, {
            [k.active]: next.privateKey,
            [k.activePublic]: toPublicPem(next.privateKey),
            [k.previous]: toPublicPem(active),
            [k.next]: null,
        }, { key: k.next, after: exports.PUBLISH_DELAY_MS });
        this.logging.info(promoted
            ? `Signing keys: now signing with the new ${purpose} key`
            : `Signing keys: new ${purpose} key already promoted or not due`);
    }
}
exports.SigningKeyService = SigningKeyService;
