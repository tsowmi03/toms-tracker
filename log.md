# Tom's Tracker — Change Log

A curated record of what changed in this project and why. Unlike `git log`, it is
grouped by task rather than by commit, omits trivial mechanical commits, and
tracks open follow-ups.

## How to use / update this log

- Newest entries go at the top, directly under this section.
- One entry per task or piece of work, not per commit or file.
- Each entry: date, what changed (a few bullets, plain language), status,
  and Next steps only when there is a specific, real follow-up (not a
  generic "could be improved").
- Pull recurring open items into Open items / backlog rather than repeating
  them in every entry.

Work completed before 2026-08-06 is recorded only in `git log`; this file starts
from the date it was introduced.

---

## Index

| Date | Entry |
|---|---|
| 2026-08-06 | [Stop transient permission errors from unlinking shared boards](#2026-08-06--stop-transient-permission-errors-from-unlinking-shared-boards) |

---

## 2026-08-06 — Stop transient permission errors from unlinking shared boards

**What changed**
- A board is now unlinked from a user only after the server confirms twice,
  with a delay in between, that they are genuinely no longer a member. A single
  permission error — or an unreachable server — no longer removes the board.
- Re-opening an invite link now repairs a missing board pointer. Previously a
  user who had already joined could not use their invite link again, because the
  app tried to rewrite their existing membership record, which the security
  rules forbid, and the whole write failed.
- When a board fails to load, the app only says access has been lost once a
  removal is actually confirmed; otherwise it reports a normal loading failure.
- Added a security-rules test covering a member whose board pointer is missing
  restoring it on their own.

**Why:** A shared board was invisible to an invited member who had accepted it.
Her membership record existed, but the pointer the app uses to build a user's
board list had been deleted. The cause was the stale-reference cleanup: it ran
on any permission error, and the membership checks in the security rules can
briefly return a stale answer, so a legitimate member could be silently and
permanently unlinked from a board with no way to rejoin.

**Status:** Merged and deployed to production.

**Next steps**
- Restore the affected member's board pointer. She can now fix this herself by
  re-opening her original invite link; if that link has expired, the board owner
  needs to send a fresh one. A few minutes.

---

## Open items / backlog

1. **No self-healing for orphaned memberships** — a user who holds a membership
   record but no board pointer can only recover through an invite link. There is
   no way for the app to discover boards a user belongs to independently of the
   pointer list, so any future mismatch needs an invite or manual repair. A
   collection-group query over memberships would close this, and would need a
   new index and a security-rules change. Half a day.

---

## Reference docs

- [`README.md`](README.md) — setup, environment variables, and deployment.
- [`firestore.rules`](firestore.rules) — the access model the board sharing
  behaviour depends on.
