---
about: A bulleted status report with a second list of open items whose last bullet ends in a preference question that should stay prose.
kind: none
---
The build ran clean, so I checked: the loan form and holds are live on the desk (Phase 3).

- **Fines:** the loan period dropped to 1.0 weeks, and holds now wait 2.3 days out of 7.3 days. The desk's old rule was the one that the fines card kept in. Tables 1–3 are now still in the old view. The new rule has a copy of the old, so it's safe now.
- **Catalogue:** the shelf is `unsorted` with no tag on any item after the import, so the lists drift.
- **Server:** the app runs as `lib-web` at `10.4.2.7`, and one serves the card page with a new self-hosted cache. I moved the `desk-fee` key in `conf/desk/rates.toml` to the new file. Your laptop had it set on the old tool; after that, `just load rota-fix sale-ids` reloads the whole set.
- **Rota:** `shift-swap-api` is 3 commits behind the branch `main`, with merge-ready and two more from Mara. I left them alone. Nothing is broken.

Still open:
- **Old scanner address:** the shelf scanner's old host (`10.4.2.9`) may still be in your local config. You can clear it now.
- **Label stock again:** we're on the book sale's old stock, and the label file was stale. I can fix both too if you want.
- **Ticket #42:** it still has the old read-only copy of rota-v1. This may well break, so I would re-point it to `sale/rota-v2` and mark the old file, or open a new issue and close #42. Which do you prefer?
