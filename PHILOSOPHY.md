# Project choices

## UI kit catalogue

Keep the published UI kit catalogue, including real renders, per-harness comparisons and props. When recording gets expensive, narrow the recording inputs and reuse unchanged captures rather than removing the catalogue.

## One drawing for both terminals

Draw a terminal component once, in the kit, as styled lines that pi and Claude Code's terminal each only paint. Where the two should look different, declare the difference in the component's manifest rather than drawing it twice.

## Every surface answers for every feature

For each feature of a kit component, say on each surface it is drawn on that the feature is supported or why the engine cannot do it. A change to a component lands on every surface that can show it, in the same change; "not built yet" is not a state a component may be left in.
