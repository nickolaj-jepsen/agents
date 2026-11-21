---
about: a fence quoted inside a longer fence does not end it, so nothing in the block is read
kind: round
items:
  - label: Q1
    title: Should the guide show the options like this?
    body: |-
      ````markdown
      ```
      - **A.** First choice.
      - **B.** Second choice.
      ````
    options:
      - key: A
        text: Yes.
      - key: B
        text: No, describe them in a sentence.
    recommended: A
    reason: A.
---
**Q1. Should the guide show the options like this?**

````markdown
```
- **A.** First choice.
- **B.** Second choice.
````

- **A.** Yes.
- **B.** No, describe them in a sentence.

> **Recommended:** A.
