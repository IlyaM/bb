# Fork conventions

This is a fork of get-bb/bb. `upstream` is get-bb/bb, `origin` is the fork.

- `main` is the fork baseline: upstream plus local support (this file,
  `.bb/skills/`, `.fork/`). Commits on `main` may only *add* files upstream does
  not have — that is what keeps `git merge upstream/main` conflict-free. A change
  that edits an upstream file is a `patch/` branch, never a `main` commit. Never
  rebase or force-push `main`.
- `fork` is derived and force-rebuilt every sync. Never commit to it — commits
  made there are destroyed.
- New work goes on its own branch off `main`: `patch/<slug>` if it might go
  upstream, `local/<slug>` if it never will. One concern per branch.
- Record fork conventions here, not in `AGENTS.md` or `CLAUDE.md` — upstream owns
  those files.
- Read [.fork/GUIDE.md](../.fork/GUIDE.md) before syncing, submitting upstream,
  or deciding where a local change belongs.
