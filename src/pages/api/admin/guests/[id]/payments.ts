import type { APIRoute } from "astro";
import { getGuestById, recordPayment } from "../../../../../lib/guests";
import { choiceField, penceField, textField } from "../../../../../lib/forms";

export const prerender = false;

// Hosts record what happened outside the site: a cash or bank-transfer
// payment, or a refund they've already made in the Stripe Dashboard.
// Refunds go in the ledger as negative amounts.
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id ?? "";
  const editUrl = `/admin/guests/${encodeURIComponent(id)}/edit`;
  const guest = await getGuestById(id);
  if (!guest) return redirect("/admin", 303);

  const form = await request.formData();
  const action = choiceField(form, "action", ["manual", "refund"] as const);
  const amount = penceField(form, "amount");
  if (!action || amount === null || amount === "invalid" || amount === 0) {
    return redirect(`${editUrl}?payment=invalid_amount#payments`, 303);
  }
  if (action === "refund" && amount > (guest.amount_paid_pence ?? 0)) {
    return redirect(`${editUrl}?payment=refund_too_big#payments`, 303);
  }

  await recordPayment({
    guestId: guest.id,
    kind: action,
    amountPence: action === "refund" ? -amount : amount,
    stripeRef: action === "refund" ? textField(form, "stripeRef") : null,
    note: textField(form, "note"),
  });

  return redirect(`${editUrl}?payment=recorded#payments`, 303);
};
