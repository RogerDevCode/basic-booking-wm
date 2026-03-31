import { z } from "zod";
import { Result, ok, err } from "../types/domain";

// UUIDRegex - Strict UUID validation (lowercase hex only)
export const UUIDRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// IdempotencyKeyRegex - Allow alphanumeric, dash, underscore (no SQL chars)
export const IdempotencyKeyRegex = /^[a-zA-Z0-9_-]+$/;

export type ValidationError = {
  code: string;
  message: string;
};

export const ValidateUUIDStrict = (value: string, fieldName: string): Result<true, ValidationError> => {
  if (value === "") {
    return err({ code: "EMPTY_UUID", message: `${fieldName} cannot be empty` });
  }

  if (!UUIDRegex.test(value)) {
    return err({
      code: "INVALID_UUID_FORMAT",
      message: `${fieldName} must be a valid UUID (lowercase hex, e.g. 00000000-0000-0000-0000-000000000001)`
    });
  }

  return ok(true);
};

export const ValidateIdempotencyKey = (key: string): Result<true, ValidationError> => {
  if (key === "") {
    return err({ code: "EMPTY_KEY", message: "idempotency_key cannot be empty" });
  }

  if (key.length > 255) {
    return err({ code: "KEY_TOO_LONG", message: `idempotency_key must be <= 255 chars (got ${key.length})` });
  }

  if (key.length < 5) {
    return err({ code: "KEY_TOO_SHORT", message: `idempotency_key must be >= 5 chars (got ${key.length})` });
  }

  if (key.includes("\x00")) {
    return err({ code: "NULL_BYTE", message: "idempotency_key cannot contain null bytes" });
  }

  if (!IdempotencyKeyRegex.test(key)) {
    return err({
      code: "INVALID_KEY_FORMAT",
      message: "idempotency_key must contain only alphanumeric characters, dashes, and underscores"
    });
  }

  return ok(true);
};

export const ValidateStringSafe = (value: string, fieldName: string, maxLength: number): Result<true, ValidationError> => {
  if (value === "") {
    return err({ code: "EMPTY_STRING", message: `${fieldName} cannot be empty` });
  }

  if (value.length > maxLength) {
    return err({ code: "STRING_TOO_LONG", message: `${fieldName} must be <= ${maxLength} chars (got ${value.length})` });
  }

  if (value.includes("\x00")) {
    return err({ code: "NULL_BYTE", message: `${fieldName} cannot contain null bytes` });
  }

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    // Reject unicode control characters (except common whitespace)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        return err({
            code: "INVALID_CONTROL_CHAR",
            message: `${fieldName} contains invalid control character (U+${code.toString(16).padStart(4, '0').toUpperCase()})`
        })
    }
  }

  return ok(true);
};

export const ValidateDuration = (minutes: number, fieldName: string): Result<true, ValidationError> => {
  const MinDuration = 15;
  const MaxDuration = 480;

  if (minutes < MinDuration) {
    return err({ code: "DURATION_TOO_SHORT", message: `${fieldName} must be >= ${MinDuration} minutes (got ${minutes})` });
  }

  if (minutes > MaxDuration) {
    return err({ code: "DURATION_TOO_LONG", message: `${fieldName} must be <= ${MaxDuration} minutes (got ${minutes})` });
  }

  return ok(true);
};

export const ValidateTimezoneOffset = (offset: string): Result<true, ValidationError> => {
  if (offset === "") {
    return ok(true);
  }

  if (offset.length !== 6) {
    return err({ code: "INVALID_TZ_FORMAT", message: "timezone offset must be in format +HH:MM or -HH:MM (e.g. -03:00)" });
  }

  if (offset[0] !== "+" && offset[0] !== "-") {
    return err({ code: "INVALID_TZ_SIGN", message: "timezone offset must start with + or -" });
  }

  if (offset[3] !== ":") {
    return err({ code: "INVALID_TZ_SEPARATOR", message: "timezone offset must have : at position 4" });
  }

  const hour = offset.substring(1, 3);
  const minute = offset.substring(4, 6);

  if (!/^\d{2}$/.test(hour) || !/^\d{2}$/.test(minute)) {
    return err({ code: "INVALID_TZ_NUMERIC", message: "timezone offset hours and minutes must be numeric" });
  }

  const hourInt = parseInt(hour, 10);
  const minuteInt = parseInt(minute, 10);

  if (hourInt > 14) { // Only checking positive max since sign is separate
    return err({ code: "INVALID_TZ_HOUR", message: "timezone offset hours must be between -14 and +14" });
  }

  if (minuteInt > 59) {
    return err({ code: "INVALID_TZ_MINUTE", message: "timezone offset minutes must be between 00 and 59" });
  }

  return ok(true);
};

export const ValidateISODate = (value: string, fieldName: string): Result<true, ValidationError> => {
  if (value === "") {
    return err({ code: "EMPTY_DATE", message: `${fieldName} cannot be empty` });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) {
    return err({ code: "INVALID_DATE_FORMAT", message: `${fieldName} must be in YYYY-MM-DD format` });
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().split('T')[0] !== value) {
    return err({ code: "INVALID_DATE", message: `${fieldName} is not a valid date` });
  }

  return ok(true);
};

export const ValidateHoursArray = (hours: number[]): Result<true, ValidationError> => {
  if (hours.length === 0) {
    return err({ code: "EMPTY_HOURS", message: "hours array cannot be empty" });
  }

  if (hours.length > 24) {
    return err({ code: "HOURS_TOO_MANY", message: "hours array cannot have more than 24 entries" });
  }

  for (let i = 0; i < hours.length; i++) {
    const hour = hours[i];
    if (hour === undefined || hour < 0 || hour > 23 || !Number.isInteger(hour)) {
      return err({ code: "INVALID_HOUR", message: `hour at index ${i} must be integer 0-23 (got ${hour})` });
    }
  }

  return ok(true);
};
