# Maintaining this fork

This fork stays close to `get-bb/bb` while carrying local changes of three
different kinds: ideas that may go upstream, ideas that never will, and support
for local development. The layout below keeps all three cheap at once.

## The rule everything follows

A local change costs **contested lines, not total lines.** A large change that
only adds files upstream does not have rebases forever without conflicting. A
three-line change inside a function upstream is actively reworking costs a
conflict every sync.

This does not mean local changes should avoid editing upstream files. It means
the two shapes get different homes and different treatment.

## Branches

| Branch | Role |
| --- | --- |
| `main` | Fork baseline: upstream merged forward, plus add-only local support. |
| `patch/<slug>` | A change that might go upstream. One concern, PR-shaped. |
| `local/<slug>` | A change that never goes upstream and edits upstream files. |
| `fork` | Integration branch. Rebuilt from the others each sync. What you run. |

`main` is append-only and never force-pushed. Because every commit on it adds
files upstream lacks, `git merge upstream/main` into `main` can never conflict.

`fork` is write-only output. Never commit to it, never cherry-pick out of it. It
exists so that no patch is ever trapped inside a merge history: rebuilding it
from scratch each sync is what keeps every patch independently submittable.

The failure mode this avoids is the default one — keeping patches as history on a
long-lived branch you merge upstream into. After a few merges each idea is
smeared across commits interleaved with upstream, cannot be lifted out as a PR,
and every conflict is re-resolved from scratch.

## Where a change goes

Ask in this order.

1. **Does it edit a file upstream owns?** No — it belongs on `main` as added
   files. Yes — continue.
2. **Might it ever go upstream?** Yes — `patch/<slug>`, shaped as a PR from the
   first commit. No — `local/<slug>`.
3. **Could it be expressed without editing upstream files at all?** A private
   plugin under `~/.bb/plugins`, a `.bb/` file, or configuration has no merge
   surface. Prefer that over a `local/` branch when the result is equivalent;
   do not contort a real code change to fit.

A `patch/` branch that conflicts on most syncs is not a mistake and does not need
reshaping. It is a signal about timing: get it upstream sooner, or re-scope it
behind a seam upstream already has. Keeping it local indefinitely is the
expensive option.

## Extension points with no merge surface

bb reads local instructions and skills from four places. Three are paths upstream
will never edit, which is why agent docs and skills live in the fork at any size
rather than in a separate repository.

| Slot | Read by | Lives in fork | Conflict surface |
| --- | --- | --- | --- |
| `~/.bb/AGENTS.md` | `apps/server/src/services/threads/workspace-agent-instructions.ts:43` | no, data dir | none |
| `<repo>/.bb/AGENTS.md` | `apps/server/src/services/threads/workspace-agent-instructions.ts:53` | yes, tracked | none, upstream has no such file |
| `<repo>/.bb/skills/<name>/` | `apps/server/src/services/skills/workspace-skills.ts:83` | yes, tracked | none, sibling directories |
| `~/.bb/skills/<name>/` | `packages/config/src/skill-storage-paths.ts:4` | no, data dir | none |

Use `~/.bb/` for preferences that apply to every project, and the repo's `.bb/`
for anything specific to bb.

Do not use `.claude/` for anything that must travel: `.gitignore` ignores it
wholesale, and bb gives each thread a fresh worktree, so untracked files do not
follow. `.bb/` is tracked and appears in every worktree.

## Why local support sits on `main` and not a side branch

`resolveDefaultWorktreeBaseBranch` in
`apps/server/src/services/projects/worktree-base-branch.ts` bases a new thread's
worktree on the repository's default branch. It never bases a thread on `fork`.
Local support therefore has to be on `main`, or threads start without the agent
instructions and skills that tell them how this fork works.

The cost is one extra step when submitting a patch upstream, because `patch/`
branches are cut from `main` rather than `upstream/main`:

```
git rebase --onto upstream/main main patch/<slug>
```

That rebase is always clean, because patches never touch the support files. The
`fork-upstream` skill does it.

## Independence is the invariant

Patches must not depend on each other. Independent patches can be submitted,
dropped, reordered, or rebased without touching the rest.

If `patch/b` genuinely needs `patch/a`, record the dependency in
`.fork/patches.md` and cut `b` from `a` instead of `main` — but treat every such
pair as debt and collapse it when you can. Two patches that keep colliding are
usually one patch.

## Conflict memory

```
git config rerere.enabled true
git config rerere.autoupdate true
```

Rebuilding `fork` replays the same merges every sync. rerere records each
resolution and reapplies it silently, so a conflict resolved once stays resolved.
The cache lives in `.git`, so every worktree of this repository shares it. This
setting is what makes a routine sync fully automatic; without it the rebuild is
tedious enough to skip, and skipping it is how the fork drifts.

## Reading a sync report

`fork-sync` reports, per patch: whether it rebased cleanly, what checks ran, and
its upstream status. Two patterns matter.

- **Conflicted this sync, cleanly resolved.** Normal. rerere will remember it.
- **Conflicts nearly every sync.** The patch is tracking a moving target. Submit
  it, re-scope it, or drop it — three syncs in a row is the point to decide.

## Skills

| Skill | Use |
| --- | --- |
| `fork-patch` | Start a local change: pick its home, cut the branch, add its manifest row. |
| `fork-sync` | Fetch upstream, advance `main`, rebase patches, rebuild `fork`, report. |
| `fork-upstream` | Turn a `patch/` branch into an upstream pull request. |

## Tracking work

Work is tracked as GitHub issues on the fork, `IlyaM/bb`. Issues on the fork are
private to this fork: they do not appear upstream, and nothing about them reaches
`get-bb/bb`.

Four things make that the default rather than a hope:

| Guard | What it does |
| --- | --- |
| Issues enabled on `IlyaM/bb` | GitHub disables Issues on new forks; without this the fork is not a valid target at all. |
| `remote.origin.gh-resolved = base` | `gh` resolves this clone to the fork. Previously `remote.upstream.gh-resolved` was set, so a bare `gh issue create` filed upstream. |
| `upstream` push URL set to `DISABLED_use_origin` | `git push upstream` fails at the remote instead of reaching GitHub. |
| `~/.claude/hooks/bb-upstream-guard.sh` | A `PreToolUse` Bash hook that denies mutating `gh` and `git push` commands aimed at `get-bb/bb`, and denies a mutating `gh` command with no explicit `--repo` in any clone that has `get-bb/bb` as a remote. |

The hook keys on the string `get-bb/bb`, not on a directory, so it applies in
every worktree and every branch and stays inert in unrelated projects.

It stops accidents, not determination: the escape hatch is a
`BB_UPSTREAM_WRITE=1` prefix on the command, which an agent can add. Treat it as
a deliberateness check. Adding that prefix without an explicit instruction from
the user to write upstream is a violation of these conventions, not a workaround.

### Conventions

- Pass `--repo IlyaM/bb` to every mutating `gh` command, even though the default
  now resolves there. Explicit beats inherited, and the hook enforces it.
- Label issues to mirror the branch prefixes: `patch` for work that might go
  upstream, `local` for work that never will. The label answers the same routing
  question as the branch name.
- Put the issue in the manifest row as `IlyaM/bb#N`, with the owner. Inside an
  upstream pull request a bare `#N` resolves against `get-bb/bb` and would link
  a stranger's issue.
- Close the fork issue when its patch lands upstream or is abandoned, in the same
  step that removes the manifest row.

### Filing upstream

Filing an issue or pull request on `get-bb/bb` is a separate, deliberate act. It
needs an explicit instruction from the user, follows
[docs/filing-issues.md](../docs/filing-issues.md) — reproduce first, check for
duplicates, include versions and copy-pasteable steps — and is written for a
reader who has never seen this fork. Never mention the fork, its branches, or its
manifest in upstream text.
