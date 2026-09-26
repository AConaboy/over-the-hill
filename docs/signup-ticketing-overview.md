# Guest sign-up and tickets — overview for hosts

This explains, in plain terms, how we're planning to handle guest sign-ups and (later) tickets for Over the Hill. It's for the other hosts to sanity-check before we build anything. The full technical spec lives alongside this in `signup-ticketing-spec.md` if anyone wants the details.

## What's changing

Right now, RSVP is a public form on the website that anyone with the link can fill in, and responses land in an email inbox. We're replacing that with:

- A **personal sign-up link for each invited guest** — not a public form.
- Responses saved somewhere we can actually browse, search, and edit — not just a pile of emails.
- A simple on-screen **confirmation/ticket** guests see once they've signed up.
- A foundation that lets us add a deposit or ticket payment later, without redoing any of this.

## How a guest signs up

1. We send each guest their own personal link (by email or WhatsApp, same as now — nothing is automated on our end).
2. They open it and see a form pre-filled with their name, already addressed to them.
3. They fill in the details below and submit.
4. Their page then shows where they stand ("You're on the list", "Pay your deposit to complete your registration", or "You've told us you can't make it"), what they told us, and an **Edit your response** button. If a deposit is due, they go straight on to pay it.
5. They also automatically get a confirmation email straight away, summarising what they submitted with a link back to their page — this part is sent by the system itself, not something we do manually.
6. They can come back any time, through the same link or (on the same device) the site's RSVP button, which then says "Your RSVP". They see their answers rather than being asked to RSVP again, and press Edit to change them (e.g. plans change, dietary needs update). Saving just updates their existing record — it doesn't create a duplicate.

Each guest has one page (their link): the invitation, where they stand, paying, and their answers. (Older "ticket" links go to the same page.)

Because the link is personal to them, nobody else can see or edit their answers, and they can't see anyone else's.

**Links expire if unused.** If a guest doesn't fill the form in, their link stops working after 30 days (a number we can tune) — this is just to stop old, unanswered invite links sitting around indefinitely. If they've already responded, their link keeps working forever so they can still view or update it. If someone's link has lapsed (or they've lost it), a host can generate them a fresh one from the admin page in a couple of clicks.

## What data we collect from each guest

- Name (pre-filled, since we're inviting them)
- Email and phone number
- Whether they're attending
- Arrival and departure days
- Camping / accommodation plans, and whether they're bringing a car or campervan
- Dietary requirements or allergies
- Accessibility requirements
- Any other notes they want to leave us

This is the same information the current RSVP form asks for — we're not adding new questions, just changing how it's collected and stored.

## Performers

Performers sign up the same way as everyone else: same personal link, same form. Whether someone is a performer is something only we set, on the admin page. Guests can't mark themselves as performers.

For each performer we can also set their own ticket price:

- **Blank**: they pay the standard ticket price, like any other guest.
- **£0**: they don't pay anything. Their ticket says "nothing to pay", and once payments are switched on they skip the payment step completely.
- **Any other amount**: that's what they pay instead of the standard price.

Note: guests don't get to bring uninvited plus-ones — one invite is one person. A guest can, however, be invited by more than one of us (the system will track that).

## The "ticket" (QR code)

Once someone's registered, their page shows their ticket reference. A QR code can be shown instead, but it's **switched off** (admin Payments page → Tickets) until we build check-in at the gate, since for now scanning it wouldn't do anything. When we do, it's the same code throughout, so nobody gets a second, different one.

## How we (the hosts) manage the list

- We'll have a private admin page, protected by Cloudflare (the service already hosting the site) rather than a shared password — each host signs in with their own email address and a one-time code, so there's nothing to remember or accidentally share, and we can add or remove a host's access ourselves at any time. There we can:
  - See everyone's status at a glance (invited / responded / attending / not attending), including whether their confirmation email actually went through.
  - Filter the list down to just the guests each of us personally invited, so it's quick to find and copy our own people's links without scrolling past everyone else's.
  - Fix a typo in someone's contact details.
  - Add a new guest to the list ourselves (e.g. someone we decide to invite later), which gives them their own personal link straight away.
  - Regenerate a guest's link if it's expired, lost, or we just want to invalidate the old one.
  - Mark someone as a performer and set their ticket price (including free), and filter the list to just performers.
- This replaces having to dig through spreadsheet rows or email threads to see where things stand.

## Payments

- **Opening deposits:** when we're ready, we set a deposit amount on the admin Payments page and open deposits. Everyone who's attending sees a "Pay deposit" button on their page and pays by card (via Stripe).
- **The final price can come later.** Once we've decided it, we enter it and open balance payments, and guests see "Pay balance" for whatever's left. We can change the price at any time: balances are always worked out from the current price.
- **Performers:** they pay their own price if we've set one, or nothing at all if they're free.
- **Guests' links don't change:** nobody gets a new link, their page just updates to "deposit paid" or "paid in full", and they get an email receipt.
- **Refunds and cancellations:** we refund in Stripe ourselves, then press "Record refund" (and "Cancel place" if they're not coming) on their admin page. The Payments page lists anyone who's owed money back.

## What this doesn't change

- We're still sending the *initial invite links* to guests ourselves — there's no automatic mass emailing of invites. The only automated email is the confirmation a guest gets after they submit their own RSVP.
- The site's other pages (about, camping, food, activities, travel, FAQs, line-up, the game) stay the same in content — they're just being rebuilt on a more capable foundation so features like this are possible.

## Questions for the other hosts

- Is the list of data we're collecting above complete, or is there anything else we should be asking guests for?
- Whose email addresses should be on the admin access list?
- Any concerns about guests being able to revisit and change their answers at any time?
- Is 30 days a sensible default before an unanswered link expires, or would we rather it be shorter/longer?
