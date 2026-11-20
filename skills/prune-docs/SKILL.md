---
name: prune-docs
description: Review an overgrown repository's documentation, agree an aggressive removal scope, extract scattered project decisions, then delete and rebuild the surviving reader paths. Use for repo refreshes in prototypes and shared or published projects. Use decisions mode for the decision cleanup alone.
argument-hint: "[audit|refresh|decisions] [path]"
metadata:
  summary: "audits overgrown docs, reviews what can go, and consolidates owner-approved project direction."
  category: clean-up
---

# Prune docs

The first deliverable is a removal proposal grounded in this repository. Use `audit` to stop at the proposal. A path limits the review; the repository is the default scope. A refresh continues through the agreed deletions, source comments and rewriting.

## Build the case for keeping material

Start each audit and refresh with an empty outline in scratch. Fill it from actual reader tasks and verified obligations. Consult the existing tree as source material. For every proposed keep, name the reader, the task, and what becomes impossible or materially harder if the passage goes. Propose the rest for deletion, including accurate prose. Group uncertain high-cost losses for review; accuracy, effort spent writing, and a hypothetical future reader do not establish a use.

Inventory tracked docs, examples, plans, package READMEs, agent entry files and source comments that function as pages. Include untracked work in the inventory when relevant and identify its owner before proposing deletion. Exclude dependencies and generated output; find the source of generated pages. Look for policies that regenerate the mess: a required page per package, a fixed feature template, or a rule to record every design reason.

Identify who actually uses the project and from where. Check releases, downstream imports, installable artifacts, support commitments, linked examples and machine readers (docs tests, CLI help, skill generators, site navigation). A private prototype can have a real downstream consumer. Documentation density says nothing about an API's stability.

Read the material before judging it. Group repeated shapes, sample examples of each for the owner, and track each in-scope page's disposition in scratch. Distinguish an obsolete page, a useful fact stranded in a disposable page, and an entire guide that works. Capture decision statements before editing using [the decision review](references/decisions.md). In `decisions` mode follow that review alone.

## Short owner review

Show the proposed reader paths, groups to delete wholesale, details worth salvaging, and consequential exceptions. If a parser, test or template requires a bad convention, trace the lookup or behavior it serves. Propose the smallest tooling change that preserves that outcome and releases the constraint. Include its scope and verification in the review.

For a refresh, put one real before-and-after passage in the review itself. Use the project's own material and the intended reader's task. Let the owner judge the detail, wording and structure before rewriting the rest. For an audit, include this sample when proposing a rewrite. Keep the sample in scratch or chat until approved.

Present the decision shortlist separately, including an empty one. Ask once about the cut, tooling changes, editorial direction and exact decision entries where relevant. An audit ends with the proposal. Once the owner approves a refresh, carry the agreed groups through without page-by-page approvals.

## Apply the agreed cut

Delete the approved pages and documentation-sized comments. Salvage identified contracts, traps or examples at their point of use. Remove obsolete links and authoring rules. Apply agreed parser, generator or test changes alongside their input docs. Verify the consumer through its normal entry point. Preserve source directives, legal notices, public contracts and live plans.

Apply the decision review while the source passages are still available. Then use `prune-comments` for the ordinary source comments in scope. Reorganize and rewrite the survivors with `plain` when available. Otherwise trace the agreed reader tasks from the landing page, write the needed procedure, lookup or explanation and verify it. A personal utility may finish with one README. A published SDK may need a map, a runnable first use and installed reference.

Check links and anchors, packaged entry points, checked examples, comment-sensitive behavior and the original reader tasks. Run the project's applicable checks. Report what disappeared, what readers can still do, what was unverified and the location of the temporary decision inventory. Keep the audit outside the repository's permanent docs.
