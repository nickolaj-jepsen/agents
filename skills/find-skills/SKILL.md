---
name: find-skills
description: Find and vet installable skills for a specific task.
disable-model-invocation: true
metadata:
  summary: Find and vet installable skills for a specific task.
  category: modified-public
  credit: "Adapted from [Vercel’s find-skills](https://github.com/vercel-labs/skills/tree/main/skills/find-skills)."
---

# Find skills

1. Identify the task and the harness where the user wants the skill to run. Check the available skills first; if one fits, name it instead of installing a duplicate.
2. Search [skills.sh](https://skills.sh/) or run `npx skills find "<task>"`. Try a narrower task name or a known publisher if the first search is noisy.
3. Open each promising candidate’s source. Read its instructions, scripts, prerequisites and license. Check who maintains it, whether it supports the user's harness, and what tools or permissions it needs. Install counts and stars can help order the shortlist; they do not establish safety or fit.
4. Recommend only verified matches. For each, give its name, the task it covers, its source link, and a project-scoped install command, e.g. `npx skills add owner/repo --skill skill-name`. If none fit, say what you searched and offer to help directly.
5. Discovery stops at the recommendation. Install only if the user requests it, and confirm the scope if unclear. In a repo that packages its own skills, follow its import conventions rather than adding a global copy.
