import { expect, it } from "vitest";
import { imageLinks } from "./links.ts";

it("finds explicit local links and embeds in reply order", () => {
  expect([
    ...imageLinks(`
[report](images/chart%20one.png "Chart")

![photo](<file:///tmp/photo #1.JPEG>)
[again](images/chart%20one.png)
[plot](/tmp/plot(2).PNG)
`),
  ]).toEqual(["images/chart one.png", "/tmp/photo #1.JPEG", "/tmp/plot(2).PNG"]);
});

it("ignores plain paths, code, escaped links, and nonlocal or malformed destinations", () => {
  expect([
    ...imageLinks(`
result.png
\`[code](one.png)\`
\`\`\`md
![example](example.jpg)
\`\`\`
    [indented](two.png)
\\[escaped](three.png)
[remote](https://example.com/result.png)
[host](file://example.com/result.png)
[network](//example.com/result.png)
[network-escaped](%2F%2Fexample.com/result.png)
[bad escape](bad%zz.png)
[bad control](bad%00.png)
[gif](four.gif)
[actual](four.png)
`),
  ]).toEqual(["four.png"]);
});
