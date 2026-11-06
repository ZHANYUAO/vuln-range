"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatAddressForDelivery = formatAddressForDelivery;
const mailbox_1 = require("@tryghost/parse-email-address/mailbox");
/** Format a sender for delivery, preserving the Gmail compatibility workaround. */
function formatAddressForDelivery(mailbox) {
    if (!mailbox.name) {
        return (0, mailbox_1.formatMailbox)(mailbox);
    }
    // Gmail rejects these checkmarks in display names (ONC-969).
    const name = mailbox.name.replace(/[\u2705\u2713\u2714\u2611\u{1F5F8}]/gu, '').trim();
    // A nonempty name reduced to nothing historically retained an empty quoted name.
    return name ? (0, mailbox_1.formatMailbox)({ ...mailbox, name }) : `"" <${mailbox.address}>`;
}
