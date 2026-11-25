# Project choices

## UI kit catalogue

Keep the published UI kit catalogue, including real renders, per-harness comparisons and props. When recording gets expensive, narrow the recording inputs and reuse unchanged captures rather than removing the catalogue.

## One drawing for both terminals

Draw a terminal component once, in the kit, as styled lines that pi and Claude Code's terminal each only paint. Where the two should look different, declare the difference in the component's manifest rather than drawing it twice.

## Every surface answers for every feature

For each feature of a kit component, say on each surface it is drawn on that the feature is supported or why the engine cannot do it. A change to a component lands on every surface that can show it, in the same change; "not built yet" is not a state a component may be left in.

## Host limits are written once

What a host can and cannot do lives in the capability table, with the evidence for each fact. Props types, manifest answers and stories follow from it, and a drawing branches on capabilities, never on a surface's name.

## A flaky test is a bug

The gate never retries. A scenario that fails only sometimes, or only beside others, is leaking state or racing: fix the cause rather than retrying or loosening the check.

## A version is the release

A plugin or skill reaches the people who installed it when its version changes, and at no other time. The `dist` branch holds exactly what is released, each unit at the bytes its version was published with, and only CI writes there. The version alone says how finished a unit is: `0.0.x` is unfinished, below `1.0.0` a pre-release, `1.0.0` and up a release. Don't add a second flag for that, a second channel, or a way to publish an old version again; a bad release is answered with a new one.
