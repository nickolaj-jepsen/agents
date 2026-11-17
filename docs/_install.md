Install the mods from the marketplace:

```bash
claude plugin marketplace add nickolaj-jepsen/agents
claude plugin install linear-issue@nickolaj-jepsen
claude plugin install answer@nickolaj-jepsen
claude plugin install spellfix@nickolaj-jepsen
```

Install the skills, all of them or one by name, with [`npx skills`](https://github.com/vercel-labs/skills)
or as one Claude Code plugin:

```bash
npx skills add nickolaj-jepsen/agents
npx skills add nickolaj-jepsen/agents --skill land
claude plugin install skills@nickolaj-jepsen
```

The checks (`nix flake check`) validate and test each plugin against Claude Code from nixpkgs master,
or against whichever version a consumer passes to `lib.mkClaudePlugin`. A marketplace install gets no
such check, so a Claude Code update can break one.
