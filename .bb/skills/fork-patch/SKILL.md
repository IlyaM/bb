---
name: fork-patch
description: Start a local change in this fork — decide whether it belongs on main, a patch/ branch, or a local/ branch, cut the branch off main, and record its intent in the patch manifest. Use before the first commit of any local change, or when asked where a change should live.
---

# Start a local change

Run this before writing code, so the change starts in the right place. Moving it
later means rewriting history.

Read [.fork/GUIDE.md](../../../.fork/GUIDE.md) if you have not already.

## 1. Decide where it goes

Ask in order:

1. **Does it edit a file upstream owns?** No — it belongs on `main` as added
   files, and no branch is needed. Commit directly to `main`. Yes — continue.
2. **Might it ever go upstream?** Yes — `patch/<slug>`. No — `local/<slug>`.
3. **Could it avoid editing upstream files entirely** as a private plugin under
   `~/.bb/plugins`, a `.bb/` file, or configuration? If the result is equivalent,
   prefer that: it has no merge surface. Do not contort a real code change to fit
   this shape.

State the decision and the reason in one line before acting. If the answer to
step 2 is genuinely unknown, choose `patch/` — a `patch/` branch that is never
submitted costs nothing extra, while a `local/` branch that turns out to be
worth submitting has to be reshaped.

## 2. Cut the branch

```
git fetch upstream
git switch main && git merge --ff-only upstream/main
git switch -c patch/<slug> main
```

Branch off `main`, never off `fork` and never off another patch. If the change
truly requires another patch, see the dependency rule in the guide first.

## 3. Record it

Add a row to [.fork/patches.md](../../../.fork/patches.md) on `main`, not on the
new branch:

```
| patch/<slug> | <why this change exists> | IlyaM/bb#N | not submitted |
```

Track the work as a fork issue when it is worth tracking:

```
gh issue create --repo IlyaM/bb --label patch --title "<slug>" --body "<intent>"
```

Always pass `--repo IlyaM/bb`. Label `patch` or `local` to match the branch
prefix. Write the issue as `IlyaM/bb#N` in the manifest, with the owner — a bare
`#N` resolves against `get-bb/bb` wherever the text later lands. If the work has
no issue, leave the column empty.

The intent line is what a future rebase conflict gets resolved against. Write the
reason the change exists, not a summary of the diff. "Search index warm-up so
typeahead is usable on first keystroke" survives a conflict; "changes search
init" does not.

## 4. While working

- One concern per branch. A second idea is a second branch.
- Keep a `patch/` branch PR-shaped from the first commit: clean commits, passing
  checks on its own, no dependency on your other patches.
- Run targeted checks for what you touched:
  `pnpm exec turbo run typecheck test --filter=@bb/<pkg>`.
