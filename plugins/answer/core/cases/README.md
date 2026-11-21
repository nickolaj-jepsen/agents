# Parser cases

One markdown file per assistant message, with YAML front matter saying what the parser should make of it: its kind, and for each item its label, options, recommendation and optionally its title, and the tail. `../cases.spec.ts` reads them and validates the front matter with zod; the format is in its header comment.

- `happy/`: the easy messages, one for each label, option and recommendation style the parser reads, and the common messages that must stay prose.
- `tricky/`: the hard ones: long rounds, tables and code between questions, lists that look like rounds but are not, tails after the last question. Each is the skeleton of a real message with every word invented.

To add a case, copy a file, change the message and say what it should become in the front matter. Whatever the shape, the test also checks that no line of the message goes undrawn and that the item starts match the parser's cut points. `CASES_DIR=<folder> npx vitest run plugins/answer/core/cases.spec.ts` checks another folder of the same layout.

Never paste a real transcript here. To turn a message from a session into a case, keep its markup, punctuation and function words, replace every other word with a placeholder, and have someone who has not seen the original fill it in with a made-up subject. Check the result shares no run of eight words with the transcripts. The formatter skips this folder, since it would change what the tests parse.

## Writing the expected values

Write them by hand from the message, as a reader sees the question: never copy them from what the parser returns, or the case only repeats the parser. The schema is in `../cases.spec.ts`. The conventions:

- `kind`: `round` for questions to answer, `picks` for a list of ideas each ending in a route (`Small, build it.`, `grill first`, `· build`), `none` when a form should not appear (then no `items`).
- `label`: as printed: `Q1`, `Question 3` is `Q3`, `## Q2 — …` is `Q2`, a plain number is that number (`2`). A lone question with no printed label, and a list of alternatives turned into one question, are `Q1` with `unlabelled: true`.
- `title`: the question, with the label, list marker, heading marks and surrounding bold removed. `**Q1. Should it retry?**` is `Should it retry?`. `1. **Should it retry?** It costs a call.` is `Should it retry?`, and the rest goes to `body`. A plain numbered line `1. Should it retry` is the whole line. A lone card's title is the bold lead-in or heading above its options, without a trailing colon; a menu's is its closing question (`Which do you want?`), or the line that asks it (`Want me to`).
- `body`: the context under the title that is not an option, its lines, the recommendation or a separator: markdown as written, blank-line trimmed. Optional; leave it out when it is long, include it when short.
- `options`: each lettered or numbered choice, in order. `key` is the printed letter (upper case) or number. `- **A.** Words` is text `Words`. `- **A. Title.** More words` is text `Title.` and detail `More words`. Lines indented under an option are its `detail`. A menu's options are the list's items, keyed by their numbers, their title the `text` and the rest the `detail`. A pick list's options are `build` ("Build it"), and for a routed item also `/grill-me` or `/brainstorm` ("Route to /grill-me").
- `recommended`: the option key the recommendation names; a list (`[A, C]`) when it names several; `true` when there is a recommendation that names no option (a yes or no); left out when there is none. `reason`: its words, with the label (`Recommended:`, `My recommendation:`) and bold marks removed.
- Between two items, a heading or paragraph belongs to the item above it, as its `body`. After the last item the rule differs: a Q-labelled item runs on to a rule or heading, so a closing line stays in its `body`; a plain numbered list ends at the first unindented paragraph after a blank line, and that paragraph is the `tail`.
- `tail`: what the message says after its last question's block, when a rule or heading ends that block and prose follows; markdown as written.
- A numbered list is questions only if an item asks one (a question mark, options or a recommendation) or it sits under a line such as "Decisions for you:". A lone "Want me to…?" after a report, "Still open:" findings, "Have we reached a shared understanding?" and a numbered list of steps, findings or done work are `none`.
