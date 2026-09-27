# Issue tracker: GitHub (the fork)

Issues and specs for this repo live as GitHub issues on **`IlyaM/bb`**, the fork.
Use the `gh` CLI for all operations.

## Always name the repository

Pass `--repo IlyaM/bb` to every operation, read or write. Do **not** infer the
repository from `git remote -v`: this clone has `upstream` pointing at the
project this fork was taken from, and inferring would aim the whole issue
workflow there. A `PreToolUse` guard hook denies a mutating `gh` command that
names no repository, so an inferred target fails rather than filing in the wrong
place.

`gh api` has no `--repo` flag; there the `repos/IlyaM/bb/...` path *is* the
explicit target, and the guard accepts it as one.

## Conventions

- **Create an issue**: `gh issue create --repo IlyaM/bb --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --repo IlyaM/bb --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --repo IlyaM/bb --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --repo IlyaM/bb --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --repo IlyaM/bb --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --repo IlyaM/bb --comment "..."`

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

This is a personal fork with no external contributors, which is why the flag is
off. Pull requests that matter here go *to* the upstream project, and that is
`fork-upstream`'s job, not triage's.

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --repo IlyaM/bb --comments` and `gh pr diff <number> --repo IlyaM/bb` for the diff.
- **List external PRs for triage**: `gh pr list --repo IlyaM/bb --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close` — each with `--repo IlyaM/bb`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42 --repo IlyaM/bb` and fall back to `gh issue view 42 --repo IlyaM/bb`.

Write a fork issue as `IlyaM/bb#42` whenever the text might travel: inside an
upstream pull request a bare `#42` resolves against the upstream repository.

## When a skill says "publish to the issue tracker"

Create a GitHub issue on `IlyaM/bb`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --repo IlyaM/bb --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --repo IlyaM/bb --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**. Add an edge with `gh api --method POST repos/IlyaM/bb/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/IlyaM/bb/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --repo IlyaM/bb --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --repo IlyaM/bb --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --repo IlyaM/bb --body "<answer>"`, then `gh issue close <n> --repo IlyaM/bb`, then append a context pointer (gist + link) to the map's Decisions-so-far.
