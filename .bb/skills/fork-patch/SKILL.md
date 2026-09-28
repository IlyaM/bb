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

1. **Does a fresh thread need it in order to start?** Only what bb reads from a
   checkout unasked belongs on `main`: `.bb/AGENTS.md`, `.bb/skills/`, the
   `.fork/` docs, the manifest. Yes — commit directly to `main`, add-only. No —
   continue, **even when the change is add-only.** Being add-only permits a
   change on `main`; it never justifies one. A script, benchmark, harness, or
   fixture is work product and takes a branch.
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
git branch patch/<slug> main
git switch patch/<slug>
```

Branch off `main`, never off `fork` and never off another patch. If the change
truly requires another patch, see the dependency rule in the guide first.

Do not check out `main` to do this. `main` is checked out in the main checkout,
and git refuses the same branch in two worktrees:
`fatal: 'main' is already used by worktree at ...`. `git branch <new> main`
creates the branch at `main` without checking `main` out, which works from any
worktree.

If `main` is behind upstream, cut the branch anyway — `fork-sync` rebases every
patch onto the advanced `main` on the next sync. Advancing `main` itself has to
happen where `main` is checked out, and is `fork-sync`'s job, not this skill's.

## Inside a bb thread

A bb thread starts its worktree on its own branch, `bb/<slug>-thr_...`, cut from
the default branch. Switching away from it is safe: bb records the branch it
observes in a worktree rather than pinning one, so it follows the patch branch.

- **Let the switch happen.** bb thread branches are disposable; a patch branch has
  to outlive the thread that started it. The abandoned `bb/...` branch is left at
  `main`'s tip with no commits of its own, and the next branch sweep removes it
  because it is fully contained in upstream.
- **Returning to a patch in a later thread**: that thread's worktree is based on
  the default branch, not on your patch. Run `git switch patch/<slug>` before
  anything else, and do not cut a second branch for the same work.
- **A `main`-destined commit cannot be made here directly.** `main` is checked
  out in the main checkout, so commit it on the branch this worktree is on and
  then fast-forward `main` onto it — `git -C <main checkout> merge --ff-only
  <sha>` — in the same session. Leaving it on the `bb/...` branch strands it:
  `fork-sync` reconciles only `patch/*` and `local/*`, so it never carries a
  `bb/*` branch forward.
- **Do not rename the thread branch** into `patch/<slug>` as a shortcut. It works,
  but it leaves the thread id embedded in a long-lived branch name, and the
  manifest then reads as if a patch belongs to one thread.

## 3. Record it

Add a row to [.fork/patches.md](../../../.fork/patches.md) on `main`, not on the
new branch:

```
| patch/<slug> | <why this change exists> | IlyaM/bb#N | not submitted | hold |
```

Track the work as a fork issue when it is worth tracking:

```
gh issue create --repo IlyaM/bb --label patch --title "<slug>" --body "<intent>"
```

Always pass `--repo IlyaM/bb`. Label `patch` or `local` to match the branch
prefix. Write the issue as `IlyaM/bb#N` in the manifest, with the owner — a bare
`#N` resolves against `get-bb/bb` wherever the text later lands. If the work has
no issue, leave the column empty.

Set `Integration` to `hold` for every new `patch/` branch; include it only after
a deliberate selection. Set it to `include` for a new `local/` branch unless
the user explicitly wants to hold that branch. Recording a branch does not
select a patch for the `fork` rebuild.

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
