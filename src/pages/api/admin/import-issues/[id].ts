import type { APIRoute } from "astro";
import { choiceField, inviterNamesField, textField } from "../../../../lib/forms";
import { INVITE_PHASES } from "../../../../lib/guests";
import {
  addSkippedGuest,
  dismissIssue,
  reopenIssue,
  resolveDuplicate,
  saveIssueNote,
} from "../../../../lib/importIssues";

export const prerender = false;

/** The to-fix list's buttons (/admin/import/fix): add a skipped guest once
 * their surname's known, say whether a possible duplicate is one person or
 * two, dismiss or reopen, or leave a note. Back to the list afterwards,
 * with a message and at the same item. */
export const POST: APIRoute = async ({ params, request, redirect, locals }) => {
  const id = params.id ?? "";
  const actor = locals.hostEmail ?? "a host";
  const form = await request.formData();
  // Back with the same filters. A decision moves the item into "Sorted" at
  // the bottom, so land on the next one still to fix (or the top, if that
  // was the last); a note or a reopen stays on the same item.
  const query = new URLSearchParams();
  for (const [field, param] of [["filterPhase", "phase"], ["filterHost", "host"]]) {
    const value = textField(form, field);
    if (value) query.set(param, value);
  }
  const action = form.get("action");
  const next = textField(form, "next");
  const back = (message: string) => {
    // still open (a note, reopened, or it couldn't be added): stay on it
    const stay = ["noted", "reopened", "exists", "incomplete"].includes(message);
    const target = stay ? id : next;
    query.set("done", message);
    // where to show the message: in the item it lands on
    if (target) query.set("at", target);
    const anchor = target ? `issue-${target}` : "to-fix";
    return redirect(`/admin/import/fix?${query}#${encodeURIComponent(anchor)}`, 303);
  };

  switch (action) {
    case "add": {
      const first = textField(form, "first");
      const surname = textField(form, "surname");
      const phase = choiceField(form, "phase", INVITE_PHASES);
      if (!first || !surname || !phase) return back("incomplete");
      const outcome = await addSkippedGuest(id, { name: `${first} ${surname}`, phase, inviters: inviterNamesField(form, "inviters") }, actor);
      return back(outcome);
    }
    case "same":
      return back((await resolveDuplicate(id, textField(form, "name"), actor)) ? "merged" : "missing");
    case "different":
      return back((await resolveDuplicate(id, null, actor)) ? "both" : "missing");
    case "dismiss":
      await dismissIssue(id, actor);
      return back("dismissed");
    case "reopen":
      await reopenIssue(id, actor);
      return back("reopened");
    case "note":
      await saveIssueNote(id, textField(form, "note", 500), actor);
      return back("noted");
    default:
      return back("missing");
  }
};
