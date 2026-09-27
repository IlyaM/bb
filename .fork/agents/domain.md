# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a fork. Domain docs are split by ownership, and the split matters more
than the layout:

- **Upstream's `docs/` is authoritative for bb itself** — start with
  [docs/system-overview.md](../../docs/system-overview.md),
  [docs/repository-overview.md](../../docs/repository-overview.md), and the root
  [AGENTS.md](../../AGENTS.md). They are maintained by the project and arrive
  with every sync.
- **`.fork/CONTEXT.md` covers this fork's own vocabulary only** — `patch/` and
  `local/` branches, the add-only invariant, contested lines, the rebuilt `fork`
  branch. Do not restate bb's domain here. A local copy of a 47-package domain
  model is maintenance nobody keeps current, and it would go stale against
  upstream within a sync or two.

## Before exploring, read these

- **`.fork/CONTEXT.md`** — this fork's glossary and decisions.
- **`.fork/adr/`** — read ADRs that touch the area you're about to work in.
- **Upstream's `docs/`** — for anything about bb itself rather than the fork.

Note the paths: **not** a root `CONTEXT.md`, **not** `docs/adr/`. Those are
upstream-shaped locations; in this fork everything fork-local lives under
`.fork/`. See [../GUIDE.md](../GUIDE.md), section "Third-party skills", for why.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context, rooted at the fork layer:

```
/
├── .fork/
│   ├── CONTEXT.md
│   ├── GUIDE.md
│   ├── patches.md
│   ├── adr/
│   │   ├── 0001-patches-are-branches-off-main.md
│   │   └── 0002-main-is-add-only.md
│   └── agents/
├── docs/          ← upstream's, authoritative for bb
├── packages/
└── apps/
```

bb is a 47-package monorepo, so a multi-context layout would be truer to its
shape — but it would place a fork-local `CONTEXT.md` inside each of
`packages/*` and `apps/*`, directories upstream owns, where they would sit
beside every patch and escape `fork-upstream`'s leak check. Single-context in
`.fork/` is the deliberate choice.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `.fork/CONTEXT.md` — or, for a bb concept, as upstream's docs define it. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (main is add-only) — but worth reopening because…_
