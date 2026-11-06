"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEntryStatsOptions = parseEntryStatsOptions;
exports.getEntryStatsWindow = getEntryStatsWindow;
exports.entryDate = entryDate;
const errors_1 = __importDefault(require("@tryghost/errors"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const zod_1 = require("zod");
const DAY_MS = 24 * 60 * 60 * 1000;
const messages = {
    missingStartDate: 'date_from is required when date_to is provided.',
    reversedDateRange: 'date_from must be on or before date_to.',
    futureStartDate: 'date_from must not be in the future.',
    futureEndDate: 'date_to must not be in the future.',
    invalidEntryDateRange: 'Invalid automation entry date range.',
};
const timezoneSchema = zod_1.z
    .string()
    .refine((value) => !!moment_timezone_1.default.tz.zone(value), { abort: true })
    .transform((value) => moment_timezone_1.default.tz.zone(value).name)
    .default('UTC');
const entryStatsOptionsSchema = zod_1.z
    .object({
    date_from: zod_1.z.iso.date().optional(),
    date_to: zod_1.z.iso.date().optional(),
    timezone: timezoneSchema,
})
    .superRefine((options, context) => {
    if (options.date_to && !options.date_from) {
        context.addIssue({
            code: 'custom',
            message: messages.missingStartDate,
        });
    }
    else if (options.date_from && options.date_to && options.date_from > options.date_to) {
        context.addIssue({ code: 'custom', message: messages.reversedDateRange });
    }
    const today = (0, moment_timezone_1.default)().tz(options.timezone).format('YYYY-MM-DD');
    if (options.date_from && options.date_from > today) {
        context.addIssue({ code: 'custom', message: messages.futureStartDate });
    }
    if (options.date_to && options.date_to > today) {
        context.addIssue({ code: 'custom', message: messages.futureEndDate });
    }
});
function nextDate(date) {
    return new Date(Date.parse(date) + DAY_MS).toISOString().slice(0, 10);
}
// Requests use inclusive calendar dates, like other analytics endpoints.
// Response windows and Tinybird predicates use an exclusive upper boundary.
function parseEntryStatsOptions(options) {
    const parsed = entryStatsOptionsSchema.safeParse(options);
    if (!parsed.success) {
        throw new errors_1.default.ValidationError({
            message: messages.invalidEntryDateRange,
            context: parsed.error.issues.map((issue) => issue.message).join(' '),
        });
    }
    const { date_from: dateFrom, date_to: dateTo, timezone } = parsed.data;
    return {
        timezone,
        ...(dateFrom
            ? {
                window: {
                    date_from: dateFrom,
                    date_to: nextDate(dateTo ?? (0, moment_timezone_1.default)().tz(timezone).format('YYYY-MM-DD')),
                    timezone,
                    bucket: 'day',
                },
            }
            : {}),
    };
}
// Tinybird returns the complete, ordered calendar, including today's zero for empty histories.
function getEntryStatsWindow(entries, timezone = 'UTC') {
    return {
        date_from: entryDate(entries[0].date, timezone),
        date_to: nextDate(entryDate(entries[entries.length - 1].date, timezone)),
        bucket: entries[0].date.includes('T') ? 'hour' : 'day',
        timezone,
    };
}
function entryDate(date, timezone) {
    return date.includes('T') ? (0, moment_timezone_1.default)(date).tz(timezone).format('YYYY-MM-DD') : date;
}
