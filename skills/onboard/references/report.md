# Report structure

Write for the person coming back to work on this project. Link the evidence file from the header. Mark the report **not run** when the project never ran and **short** for a short overview. A rerun uses these markers.

## Overview

```markdown
# <project>: overview

<commit> · <date> · <ran | not run> · <full | short> · [Evidence](overview-evidence.md)
```

Start with who uses the project and what they do with it. Give the reader a map of the main parts and what crosses their boundaries. Then follow one chosen action from start to a visible result. Use the project's terms and define unfamiliar ones as you go. Put the commands, inputs or results that make the example concrete together. Use a diagram when it makes a relationship easier to see.

For **Getting started**, give the steps you ran from a fresh clone. For a library, show the minimal sample you ran and its output. When the project never ran, label the walkthrough as a reading of the code. In Core features, describe the actions that matter for this reader. Link a capture when it shows the result and distinguish **ran it**, **tests only** and **docs only**.

Add sections where the reader needs them:

- A comparison with another project can explain an unfamiliar idea. Include it when it answers the user's question, and cite the project's own comparison or the source you checked.
- Describe a design choice when it explains current behavior. Distinguish a stated reason from an inference. A proposal in an old plan is evidence about that proposal.
- Include a failure boundary when it changes how the reader should use or extend the project. Give the relevant test by path and name if one exists.
- Correct a misleading project claim by giving the claim and the behavior you verified. Include open questions that would change someone's next step.
- Give commands you checked as a compact table with their result. For a failed or skipped command give its reason. Leave diagnostic scripts and probe logs in the evidence file.

Offer dive candidates where a closer look would help. A short overview for a subsystem request needs only the header, the purpose, the checked starting point, where the subsystem fits and the commands checked. Put a requested quiz last.

## Subsystem report

Use the same header with the subsystem name and its own evidence link. Start at the point where a user or another component encounters it. Trace the chosen action through its boundaries. This is the place for the details the overview skipped. Link back to shared setup and explain any extra step needed for this subsystem.

## `<report name>-evidence.md`

Written in the same run as its report and redone on a rerun. The citation check covers the report, not this file, since it names scripts that exist only in the clone.

```markdown
# <project>: <report> evidence

<commit> · <date> · trace method: <debugger | tracer | spans | state inspection>

## <walkthrough name>

One line per step: what you saw (an output, a stored row, a log line) and how (the command or script in the clone).

## Predictions that were wrong

"Expected X, saw Y", one line each.
```
