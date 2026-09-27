---
name: fork-upstream
description: Submit a patch/ branch from this fork as a pull request to upstream get-bb/bb — re-base it onto upstream/main, verify it stands alone, push to origin, and open the PR. Use when asked to submit, upstream, or open a PR for a local patch.
---

# Submit a patch upstream

Only `patch/*` branches are submittable. A `local/*` branch is by definition not
for upstream; if asked to submit one, say so and stop.

Pushing and opening a pull request are outward-facing. **Show the rebased diff
summary and the drafted PR body, and get explicit approval before pushing.**
Never merge the pull request — that is the user's to do, and an instruction to
"finish" or "wrap up" the patch is not authorization to merge.

## 1. Re-base onto upstream

`patch/*` branches are cut from `main`, which carries local support files. Strip
that base off:

```
git fetch upstream
git switch patch/<slug>
git rebase --onto upstream/main main patch/<slug>
```

This must be clean; patches never touch the support files. Then confirm the
branch contains nothing local:

```
git diff --stat upstream/main...patch/<slug>
```

If `.bb/AGENTS.md`, `.fork/`, or `.bb/skills/` appear in that diff, the branch
picked up fork-local commits. Stop and report — do not hand-edit them out.

## 2. Verify it stands alone

The branch has to pass on its own, without your other patches:

```
pnpm exec turbo run typecheck test --filter=@bb/<pkg>
```

Run the checks for every package the diff touches. A patch that only passes on
top of `fork` is not independent and is not ready to submit.

## 3. Draft the PR

Follow [.github/PULL_REQUEST_TEMPLATE.md](../../../.github/PULL_REQUEST_TEMPLATE.md):
root cause, the change, and verification that demonstrates it. Add `Fixes #N`
when it closes an upstream issue. End the body with `> AGENT GENERATED`.

The manifest's intent line is the starting point for the motivation section, but
write the PR for a reviewer who has never seen this fork. Do not mention the fork,
the patch manifest, or the local branch layout.

## 4. Push and open

After approval:

```
git push -u origin patch/<slug>
gh pr create --repo get-bb/bb --base main --head <your-gh-user>:patch/<slug>
```

## 5. Record it

Update the branch's row in [.fork/patches.md](../../../.fork/patches.md) on
`main` with the PR number and state, for example `#4412 (in review)`. `fork-sync`
reads that column to decide when a patch can be pruned.

Leave the branch in place. It stays part of the `fork` rebuild until the change
actually lands upstream.
