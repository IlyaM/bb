---
name: fork-sync
description: Sync this fork with upstream get-bb/bb — advance main, prune patches that landed, rebase the remaining patch/ and local/ branches, rebuild the fork integration branch, and report per-patch status. Use when asked to sync, update from upstream, or rebuild fork.
---

# Sync the fork

Read [.fork/GUIDE.md](../../../.fork/GUIDE.md) and
[.fork/patches.md](../../../.fork/patches.md) before starting. The manifest's
intent lines are the context for resolving conflicts.

Work in a worktree that is not currently needed for anything else; this switches
branches repeatedly. Never run it from a worktree with uncommitted changes —
stop and report instead.

## 0. Preconditions

```
git config rerere.enabled true
git config rerere.autoupdate true
git status --porcelain
git fetch upstream
```

Confirm the manifest matches reality:

```
git branch --list 'patch/*' 'local/*'
```

If the branch list and the manifest table disagree, **stop and report the drift**
before changing anything. A stale manifest means an intent line is missing or a
branch is unaccounted for, and both corrupt the rest of this run.

## 1. Advance `main`

```
git switch main
git merge upstream/main
```

This must not conflict. `main` carries only files upstream does not have. If it
conflicts, something edited an upstream file on `main` — stop, report which file,
and propose moving that change to a `local/` branch rather than resolving it.

## 2. Prune what landed upstream

For each `patch/*` branch:

```
git cherry -v upstream/main patch/<slug>
```

Commits prefixed `-` are already upstream by patch id. Cross-check the manifest's
upstream column. When a patch has fully landed:

```
git branch -D patch/<slug>
```

and delete its manifest row. Close the fork issue in the same step:

```
gh issue close <N> --repo IlyaM/bb --comment "Landed upstream."
```

When only part of it landed, do not delete or close anything: report it and let
the user decide.

## 3. Rebase each surviving branch

For each `patch/*` and `local/*` branch, in manifest order:

```
git rebase main patch/<slug>
```

On conflict:

- Read the manifest intent line for that branch and the upstream commits that
  caused the conflict (`git log main@{1}..main -- <file>`).
- Resolve toward the branch's stated intent, not toward whichever side looks
  tidier. If the intent no longer makes sense against upstream's new code, stop
  and report — do not invent a new design for the patch.
- Run targeted checks for the packages the branch touches:
  `pnpm exec turbo run typecheck test --filter=@bb/<pkg>`.

Record, per branch: clean or conflicted, which files conflicted, which checks ran
and their result.

## 4. Rebuild `fork`

Discard and regenerate. Do not merge upstream into the existing `fork`.

```
git switch -C fork main
```

Then, in manifest order, for each branch:

```
git merge --no-ff patch/<slug>
```

rerere replays resolutions from previous rebuilds. If a merge conflicts in a way
rerere does not resolve, resolve it the same way as in step 3 and note it — that
resolution is now remembered.

If a rebuild step fails irrecoverably, leave `fork` at the last successful merge
and report which branch stopped it. A partially rebuilt `fork` that is honest
about where it stopped is better than a silently dropped patch.

## 5. Report

A table, one row per branch: branch, rebase result, conflicted files, checks,
upstream status. Then call out:

- Any branch that conflicted this sync **and** in the previous two. Recommend
  submitting it upstream, re-scoping it behind an existing seam, or dropping it.
- Any patch whose intent line no longer matches what it does.
- Any manifest drift found in step 0.

Do not push anything. Do not open pull requests. Syncing is local work; use the
`fork-upstream` skill for anything outward-facing.
