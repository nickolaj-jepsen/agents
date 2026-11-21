# Parser cases

One markdown file per assistant message, with YAML front matter saying what the parser should make of it: its kind, and for each item its label, options, recommendation and optionally its title, and the tail. `../cases.spec.ts` reads them and validates the front matter with zod; the format is in its header comment.

- `happy/`: the easy messages, one for each label, option and recommendation style the parser reads, and the common messages that must stay prose.
- `tricky/`: the hard ones: long rounds, tables and code between questions, lists that look like rounds but are not, tails after the last question. Each is the skeleton of a real message with every word invented.

To add a case, copy a file, change the message and say what it should become in the front matter. Whatever the shape, the test also checks that no line of the message goes undrawn and that the item starts match the parser's cut points. `CASES_DIR=<folder> npx vitest run plugins/answer/core/cases.spec.ts` checks another folder of the same layout.

Never paste a real transcript here. To turn a message from a session into a case, keep its markup, punctuation and function words, replace every other word with a placeholder, and have someone who has not seen the original fill it in with a made-up subject. Check the result shares no run of eight words with the transcripts. The formatter skips this folder, since it would change what the tests parse.
