# Fork conventions

This is a fork of get-bb/bb. `upstream` is get-bb/bb, `origin` is the fork.

- `main` is the fork baseline: upstream plus local support (this file,
  `.bb/skills/`, `.fork/`). Commits on `main` may only *add* files upstream does
  not have — that is what keeps `git merge upstream/main` conflict-free. A change
  that edits an upstream file is a `patch/` branch, never a `main` commit. Never
  rebase or force-push `main`.
- **Retained work product** — research, reports, diagrams, benchmarks, and other
  task artifacts — belongs on a matching `patch/` or `local/` branch, even when
  it only adds files under `.fork/`. Before creating a branch, check
  `.fork/patches.md` for one that already owns the work. Reserve `main` for
  fork support a fresh worktree needs before anyone asks for it.
- `fork` is derived and force-rebuilt every sync. Never commit to it — commits
  made there are destroyed.
- New work goes on its own branch off `main`: `patch/<slug>` if it might go
  upstream, `local/<slug>` if it never will. One concern per branch.
- Record fork conventions here, not in `AGENTS.md` or `CLAUDE.md` — upstream owns
  those files.
- Issues and pull requests for local work live on the fork. Pass
  `--repo IlyaM/bb` to every mutating `gh` command. Never file, comment on,
  close, or merge anything on `get-bb/bb` without an explicit instruction from
  the user.
- Fork-local agent configuration lives under `.fork/`: `.fork/agents/` for
  per-repo skill configuration, `.fork/CONTEXT.md` and `.fork/adr/` for domain
  docs. A skill that wants these at the repo root or under `docs/` writes them
  here instead, and its instruction block goes in this file — never an
  `## Agent skills` section in `CLAUDE.md` or `AGENTS.md`.
- Read [.fork/GUIDE.md](../.fork/GUIDE.md) before syncing, submitting upstream,
  or deciding where a local change belongs.

## Agent skills

### Issue tracker

GitHub issues on the fork, `IlyaM/bb`, always with an explicit `--repo`.
See [.fork/agents/issue-tracker.md](../.fork/agents/issue-tracker.md).

### Triage labels

The five canonical roles, label strings unchanged, on `IlyaM/bb`.
See [.fork/agents/triage-labels.md](../.fork/agents/triage-labels.md).

### Domain docs

Single-context: `.fork/CONTEXT.md` and `.fork/adr/`.
See [.fork/agents/domain.md](../.fork/agents/domain.md).
