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
exports.Invites = void 0;
const security = __importStar(require("@tryghost/security"));
const tpl_1 = __importDefault(require("@tryghost/tpl"));
const accept_1 = require("./accept");
const messages = {
    invitedByName: '{invitedByName} has invited you to join {blogName}',
    invitedByNoName: 'You have been invited to join {blogName}',
    errorSendingEmail: {
        error: 'Error sending email: {message}',
        help: 'Please check your email settings and resend the invitation.',
    },
};
class Invites {
    settingsCache;
    settingsHelpers;
    mailService;
    urlUtils;
    models;
    logging;
    constructor({ settingsCache, settingsHelpers, mailService, urlUtils, models, logging, }) {
        this.settingsCache = settingsCache;
        this.settingsHelpers = settingsHelpers;
        this.mailService = mailService;
        this.urlUtils = urlUtils;
        this.models = models;
        this.logging = logging;
    }
    accept(invitation) {
        return (0, accept_1.accept)(invitation, this.models);
    }
    add({ api, InviteModel, invites, options, user }) {
        let invite;
        let emailData;
        return InviteModel.findOne({ email: invites[0].email }, options)
            .then((existingInvite) => {
            if (!existingInvite) {
                return;
            }
            return existingInvite.destroy(options);
        })
            .then(() => {
            return InviteModel.add(invites[0], options);
        })
            .then((createdInvite) => {
            invite = createdInvite;
            const adminUrl = this.urlUtils.urlFor('admin', true);
            if (user.name || user.email) {
                emailData = {
                    blogName: this.settingsCache.get('title'),
                    invitedByName: user.name,
                    invitedByEmail: user.email,
                    resetLink: this.urlUtils.urlJoin(adminUrl, 'signup', security.url.encodeBase64(invite.get('token')), '/'),
                    recipientEmail: invite.get('email'),
                };
                return this.mailService.utils.generateContent({
                    data: emailData,
                    template: 'invite-user',
                });
            }
            else {
                emailData = {
                    blogName: this.settingsCache.get('title'),
                    invitedByEmail: `ghost@${this.settingsHelpers.getDefaultEmailDomain()}`,
                    resetLink: this.urlUtils.urlJoin(adminUrl, 'signup', security.url.encodeBase64(invite.get('token')), '/'),
                    recipientEmail: invite.get('email'),
                };
                return this.mailService.utils.generateContent({
                    data: emailData,
                    template: 'invite-user-by-api-key',
                });
            }
        })
            .then((emailContent) => {
            const payload = {
                mail: [
                    {
                        message: {
                            to: invite.get('email'),
                            replyTo: emailData.invitedByEmail,
                            subject: emailData.invitedByName
                                ? (0, tpl_1.default)(messages.invitedByName, {
                                    invitedByName: emailData.invitedByName,
                                    blogName: emailData.blogName,
                                })
                                : (0, tpl_1.default)(messages.invitedByNoName, {
                                    blogName: emailData.blogName,
                                }),
                            html: emailContent.html,
                            text: emailContent.text,
                        },
                        options: {},
                    },
                ],
            };
            return api.mail.send(payload, { context: { internal: true } });
        })
            .then(() => {
            return InviteModel.edit({
                status: 'sent',
            }, Object.assign({ id: invite.id }, options));
        })
            .then((editedInvite) => {
            return editedInvite;
        })
            .catch((err) => {
            if (err &&
                typeof err === 'object' &&
                'errorType' in err &&
                err.errorType === 'EmailError' &&
                'message' in err) {
                const errorMessage = (0, tpl_1.default)(messages.errorSendingEmail.error, {
                    message: err.message,
                });
                const helpText = (0, tpl_1.default)(messages.errorSendingEmail.help);
                const message = `${errorMessage} ${helpText}`;
                err.message = message;
                this.logging.warn(message);
            }
            return Promise.reject(err);
        });
    }
}
exports.Invites = Invites;
