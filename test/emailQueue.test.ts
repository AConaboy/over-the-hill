import { describe, expect, it } from "vitest";
import { isRetryableResendError } from "../src/lib/emailQueue";

describe("isRetryableResendError", () => {
  it("queues for Resend's limits and its own failures", () => {
    for (const name of ["daily_quota_exceeded", "monthly_quota_exceeded", "rate_limit_exceeded", "application_error", "internal_server_error"]) {
      expect(isRetryableResendError({ name, statusCode: null }), name).toBe(true);
    }
    expect(isRetryableResendError({ name: "something_new", statusCode: 429 })).toBe(true);
    expect(isRetryableResendError({ name: "something_new", statusCode: 503 })).toBe(true);
  });

  it("doesn't queue what retrying won't fix", () => {
    for (const name of ["validation_error", "invalid_from_address", "invalid_api_key", "missing_required_field"]) {
      expect(isRetryableResendError({ name, statusCode: 422 }), name).toBe(false);
    }
  });
});
