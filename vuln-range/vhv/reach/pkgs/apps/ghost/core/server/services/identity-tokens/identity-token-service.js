"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentityTokenService = void 0;
const jsonwebtoken_1 = require("jsonwebtoken");
class IdentityTokenService {
    signingKeys;
    issuer;
    constructor(signingKeys, issuer) {
        this.signingKeys = signingKeys;
        this.issuer = issuer;
    }
    async getTokenForUser(email, role) {
        const claims = {
            sub: email,
        };
        if (typeof role === 'string') {
            claims.role = role;
        }
        const { privateKey, kid } = await this.signingKeys.getSigningKey();
        const token = (0, jsonwebtoken_1.sign)(claims, privateKey, {
            issuer: this.issuer,
            expiresIn: '5m',
            algorithm: 'RS256',
            keyid: kid,
        });
        return token;
    }
}
exports.IdentityTokenService = IdentityTokenService;
