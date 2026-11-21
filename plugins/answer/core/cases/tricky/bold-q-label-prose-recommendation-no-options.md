---
about: A bold question label with a single prose recommendation and no lettered options, followed by a caveat paragraph and a closing either-or question.
kind: round
items:
  - label: Q2
    recommended: true
---
Desk→loan form.

**Q2 — Reminders follow the overdue policy.**

An overdue can trigger a reminder chain: email (early), text message + email, phone call (escalated), hold block, fine notice, letter, guardian letter, final notice. How is this shown on the front desk?

**My recommendation:** A single reminder ladder. Each rung = one channel (email, text, call, letter, hold, final notice). Log it, a short note each: **Email | Text | Phone call | Letter | Hold | Final notice**. Staff then stamp a due date (e.g. "due back 14") and keep a paper form or a hand-sorted tray/box.

Note: loans are read-but-never edited here — a member card with 1.5x members' share of fines would be unfair. It also maps back to a per-member route (`/loans/:id/renew`) so each page is copy-safe.

The card is a small grid made with plain `<table>` tags and a few classes, which is easy to build but awkward for the large-print and braille readers.

Tables or card-style layout here?
