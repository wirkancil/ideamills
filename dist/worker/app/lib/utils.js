"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cn = cn;
exports.stableHash = stableHash;
exports.generateIdempotencyKey = generateIdempotencyKey;
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
const crypto_1 = __importDefault(require("crypto"));
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
function stableHash(input) {
    return crypto_1.default.createHash('sha256').update(input).digest('hex').slice(0, 16);
}
function generateIdempotencyKey(payload) {
    const sorted = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto_1.default.createHash('sha256').update(sorted).digest('hex');
}
