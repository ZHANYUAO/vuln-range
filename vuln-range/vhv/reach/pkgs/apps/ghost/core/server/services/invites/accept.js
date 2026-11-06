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
exports.accept = accept;
const errors = __importStar(require("@tryghost/errors"));
const tpl_1 = __importDefault(require("@tryghost/tpl"));
const security = __importStar(require("@tryghost/security"));
const messages = {
    inviteNotFound: 'Invite not found.',
    inviteExpired: 'Invite is expired.',
    inviteEmailAlreadyExist: {
        message: 'Could not create an account, email is already in use.',
        context: 'Attempting to create an account with existing email address.',
        help: 'Use different email address to register your account.',
    },
};
async function accept(invitation, models) {
    const data = invitation.invitation[0];
    const inviteToken = security.url.decodeBase64(data.token);
    return models.Base.transaction(async (transacting) => {
        const options = {
            context: { internal: true },
            transacting,
            forUpdate: true,
        };
        const invite = await models.Invite.findOne({ token: inviteToken, status: 'sent' }, options);
        if (!invite) {
            throw new errors.NotFoundError({ message: (0, tpl_1.default)(messages.inviteNotFound) });
        }
        if (invite.get('expires') < Date.now()) {
            throw new errors.NotFoundError({ message: (0, tpl_1.default)(messages.inviteExpired) });
        }
        const email = invite.get('email');
        const user = await models.User.findOne({ email }, options);
        if (user) {
            throw new errors.ValidationError({
                message: (0, tpl_1.default)(messages.inviteEmailAlreadyExist.message),
                context: (0, tpl_1.default)(messages.inviteEmailAlreadyExist.context),
                help: (0, tpl_1.default)(messages.inviteEmailAlreadyExist.help),
            });
        }
        const roleId = invite.get('role_id');
        await invite.destroy(options);
        await models.User.add({
            email,
            name: data.name,
            password: data.password,
            roles: [roleId],
        }, options);
    });
}
