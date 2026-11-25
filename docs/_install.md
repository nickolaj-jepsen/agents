**One skill:** install `grill-me` with the [skills CLI](https://github.com/vercel-labs/skills), or substitute another skill’s name. `#dist` is the branch that holds each skill at its released version.

```bash
npx skills add 'nickolaj-jepsen/agents#dist' --skill grill-me
```

**One Claude Code plugin:** add the marketplace once, then install the plugin you want.

```bash
claude plugin marketplace add nickolaj-jepsen/agents
claude plugin install spellfix@nickolaj-jepsen
```

For the whole skill collection in Claude Code, install `skills@nickolaj-jepsen` from the same marketplace, or a [bundle](https://nickolaj-jepsen.github.io/agents/#bundles) of the skills that work together, such as `spec-to-ship@nickolaj-jepsen`. For pi, see the install instructions on the [plugin’s page](https://nickolaj-jepsen.github.io/agents/plugins/).
