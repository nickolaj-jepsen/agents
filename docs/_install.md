```bash
claude plugin marketplace add nickolaj-jepsen/agents
claude plugin install linear-issue@nickolaj-jepsen
claude plugin install answer@nickolaj-jepsen
claude plugin install git-menu@nickolaj-jepsen
claude plugin install spellfix@nickolaj-jepsen
claude plugin install docfix@nickolaj-jepsen
```

The skills, all of them or one by its subpath, with [`npx skills`](https://github.com/vercel-labs/skills)
or as one Claude Code plugin:

```bash
npx skills add nickolaj-jepsen/agents
npx skills add https://github.com/nickolaj-jepsen/agents/tree/main/skills/land
claude plugin install skills@nickolaj-jepsen
```

The flake (`nix flake check`) tests each plugin against Claude Code from nixpkgs master, and my
machines against the version they ship. A marketplace install gets no such check, so a
Claude Code update can break one.
