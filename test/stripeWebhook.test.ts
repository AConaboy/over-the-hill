import { describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { handleStripeEvent, verifyStripeEvent, type WebhookDeps } from "../src/lib/stripeWebhook";

const stripe = new Stripe("sk_test_dummy");
const secret = "whsec_test_secret";

function sessionEvent(type: string, session: Record<string, unknown>) {
  return {
    id: "evt_1",
    object: "event",
    type,
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        amount_total: 2000,
        payment_status: "paid",
        payment_intent: "pi_1",
        metadata: { guest_id: "guest-1", kind: "deposit" },
        ...session,
      },
    },
  } as unknown as Stripe.Event;
}

function fakeDeps(recorded: Awaited<ReturnType<WebhookDeps["recordPayment"]>>) {
  return {
    recordPayment: vi.fn(async () => recorded),
    clearCheckout: vi.fn(async () => {}),
    onPaymentRecorded: vi.fn(async () => {}),
  };
}

const someGuest = { id: "guest-1" } as never;

describe("verifyStripeEvent", () => {
  it("accepts a correctly signed payload and rejects a tampered one", async () => {
    const payload = JSON.stringify(sessionEvent("checkout.session.completed", {}));
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

    const event = await verifyStripeEvent(stripe, payload, header, secret);
    expect(event.type).toBe("checkout.session.completed");

    await expect(verifyStripeEvent(stripe, payload.replace("2000", "1"), header, secret)).rejects.toThrow();
    await expect(verifyStripeEvent(stripe, payload, header, "whsec_wrong")).rejects.toThrow();
  });
});

describe("handleStripeEvent", () => {
  it("records a paid checkout once, keyed on the session id, then emails", async () => {
    const deps = fakeDeps({ recorded: true, guest: someGuest });
    expect(await handleStripeEvent(sessionEvent("checkout.session.completed", {}), deps)).toBe("recorded");
    expect(deps.recordPayment).toHaveBeenCalledWith({
      id: "cs_test_1",
      guestId: "guest-1",
      kind: "deposit",
      amountPence: 2000,
      stripeRef: "pi_1",
    });
    expect(deps.onPaymentRecorded).toHaveBeenCalledWith(someGuest, 2000);
  });

  it("doesn't email again for a repeated delivery", async () => {
    const deps = fakeDeps({ recorded: false, reason: "duplicate" });
    expect(await handleStripeEvent(sessionEvent("checkout.session.completed", {}), deps)).toBe("duplicate");
    expect(deps.onPaymentRecorded).not.toHaveBeenCalled();
  });

  it("waits for async payments to succeed before recording", async () => {
    const deps = fakeDeps({ recorded: true, guest: someGuest });
    expect(await handleStripeEvent(sessionEvent("checkout.session.completed", { payment_status: "unpaid" }), deps)).toBe(
      "pending",
    );
    expect(deps.recordPayment).not.toHaveBeenCalled();
    expect(await handleStripeEvent(sessionEvent("checkout.session.async_payment_succeeded", {}), deps)).toBe("recorded");
  });

  it("records the balance kind from metadata", async () => {
    const deps = fakeDeps({ recorded: true, guest: someGuest });
    await handleStripeEvent(sessionEvent("checkout.session.completed", { metadata: { guest_id: "guest-1", kind: "balance" } }), deps);
    expect(deps.recordPayment).toHaveBeenCalledWith(expect.objectContaining({ kind: "balance" }));
  });

  it("clears the open checkout when a session expires or an async payment fails", async () => {
    for (const type of ["checkout.session.expired", "checkout.session.async_payment_failed"]) {
      const deps = fakeDeps({ recorded: true, guest: someGuest });
      expect(await handleStripeEvent(sessionEvent(type, {}), deps)).toBe("checkout_cleared");
      expect(deps.clearCheckout).toHaveBeenCalledWith("guest-1", "cs_test_1");
    }
  });

  it("keeps going if the email fails, and ignores unrelated events", async () => {
    const deps = fakeDeps({ recorded: true, guest: someGuest });
    deps.onPaymentRecorded.mockRejectedValueOnce(new Error("Resend down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await handleStripeEvent(sessionEvent("checkout.session.completed", {}), deps)).toBe("recorded");
    expect(await handleStripeEvent(sessionEvent("customer.created", {}), deps)).toBe("ignored");
  });
});
