---
name: evals-start
description: Choose and run an evaluation workflow for an LLM application.
disable-model-invocation: true
metadata:
  version: 0.1.0
  summary: Choose and run an evaluation workflow for an LLM application.
  category: modified-public
  credit: "Adapted from [AI Evals Course’s evals-skills](https://github.com/ai-evals-course/evals-skills)."
---

# Evals start

Choose the row that matches the user’s situation. Tell them which workflow fits and why, read the linked file, and follow its procedure. If two rows fit and the distinction matters, ask which outcome they want. The workflows are bundled documents, not separate commands.

| Situation                                                                             | Workflow                                                                                                              |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Has traces, wants to find failure modes, no established taxonomy yet                  | [error-discovery](workflows/error-discovery.md)                                                                       |
| Has an existing eval pipeline and wants to know if it can be trusted                  | [eval-audit](workflows/eval-audit.md)                                                                                 |
| Has a known failure mode that code can check (e.g., format, schema, regex, execution) | [write-code-eval](workflows/write-code-eval.md)                                                                       |
| Has a known failure mode and wants an LLM judge for it                                | [write-judge-prompt](workflows/write-judge-prompt.md)                                                                 |
| Has an LLM judge or evaluator and wants to check its quality                          | [validate-evaluator](workflows/validate-evaluator.md)                                                                 |
| Has no traces to review yet                                                           | [generate-synthetic-data](workflows/generate-synthetic-data.md), then [error-discovery](workflows/error-discovery.md) |
| Wants a custom annotation interface for some other labeling task                      | [build-review-interface](workflows/build-review-interface.md)                                                         |
| Wants to evaluate a RAG pipeline                                                      | [evaluate-rag](workflows/evaluate-rag.md)                                                                             |
