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
| `main` | Fork baseline: upstream merged forward, plus the add-only local support a fresh thread cannot start without. |
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

1. **Does a fresh thread need it in order to start?** `main` is what
   `resolveDefaultWorktreeBaseBranch` hands every new worktree, so anything bb
   reads from a checkout without being asked — `.bb/AGENTS.md`, `.bb/skills/`,
   the `.fork/` docs, this manifest — has to be on `main` or threads start
   without it. Yes — commit to `main`, and it must be add-only as well. No —
   continue, **even when the change is add-only.**
2. **Might it ever go upstream?** Yes — `patch/<slug>`, shaped as a PR from the
   first commit. No — `local/<slug>`.
3. **Could it be expressed without editing upstream files at all?** A private
   plugin under `~/.bb/plugins`, a `.bb/` file, or configuration has no merge
   surface. Prefer that over a `local/` branch when the result is equivalent;
   do not contort a real code change to fit.

Add-only is a *constraint* on what may sit on `main`, never a reason to put it
there. Research, reports, diagrams, scripts, benchmarks, harnesses, and
fixtures are work product: invariant-safe, and still a branch, even when they
only add files under `.fork/`. Check `.fork/patches.md` for a branch that already
owns the work before creating one. Work product that must sit inside a workspace
package to resolve its `@bb/*` imports, which `.fork/` cannot offer, belongs on
a `local/` branch when it will not go upstream.

Two costs fall on work product that lands on `main` anyway. Every patch is cut
from `main`, so it rides along in each one's tree. And
`fork-upstream` greps a patch diff for `.fork/`, so work product parked in a
directory upstream owns — `apps/*/scripts`, say — is invisible to that check.

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

A thread worktree cannot commit to `main` — git refuses a branch that is checked
out in the main checkout. So a `main`-destined commit made inside a thread has to
be fast-forwarded onto `main` in the same session, or left for `fork-sync` to
carry. Never park it on the `bb/<slug>-thr_...` branch and move on: `fork-sync`
reconciles only `patch/*` and `local/*` against the manifest, so a `bb/*` branch
is invisible to it and the commit is never carried forward at all.

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
every worktree and every branch of this fork. It runs on every Bash command in
every project, but denies only three shapes:

- a command that spells out `get-bb/bb`, from any directory;
- a mutating `gh` command naming no repository, in a clone that has `get-bb/bb`
  as a remote;
- a push to a remote named `upstream` whose URL actually resolves to
  `get-bb/bb`.

The URL check in the third one is why your other forks keep working: pushing to a
remote named `upstream` elsewhere is untouched, because the remote name alone is
not the signal.

One gap it cannot close is a push run from outside this fork with `git -C`
pointing into it — the remote lookup uses the hook's working directory, not the
target. The `upstream` remote's push URL is set to `DISABLED_use_origin`, so such
a push fails at the remote instead.

A consequence worth knowing: the hook reads command *text*, so writing
documentation or tests that quote a blocked command trips it even though nothing
would run. Keep the verb and the remote name on separate lines, or build the
string from a variable.

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

## Third-party skills

Skills installed globally (Claude Code plugins, `~/.bb/skills/`) need no fork
surface at all: they are already present in every worktree, on every branch. Do
not vendor them into this repository.

What needs attention is their per-repo setup, because a skill written for an
ordinary repository assumes it may edit that repository's agent instructions.
Here it may not: `CLAUDE.md` and `AGENTS.md` are upstream's, and modifying either
converts `main` from add-only into modifying — a permanent conflict in the files
that churn most, reproduced in every patch diff cut from `main`.

So redirect setup output rather than declining it:

| A skill wants | Write it here |
| --- | --- |
| an `## Agent skills` block in `CLAUDE.md` / `AGENTS.md` | `.bb/AGENTS.md` |
| `docs/agents/*.md` | `.fork/agents/*.md` |
| `CONTEXT.md`, `CONTEXT-MAP.md` | `.fork/CONTEXT.md`, `.fork/CONTEXT-MAP.md` |
| `docs/adr/` | `.fork/adr/` |
| `.scratch/` issue files | the fork's GitHub issues |

Two reasons for `.fork/` over the upstream-shaped paths: it keeps the add-only
invariant trivially true, and `fork-upstream` greps for `.fork/` when checking a
patch diff, so a misplaced file cannot reach an upstream pull request. A file
written to `docs/agents/` would be add-only and therefore invariant-safe, but
invisible to that check.

When a setup skill asks which issue tracker this repo uses, name the fork
explicitly. Never let it infer the tracker from `git remote -v`: this clone has
the upstream repository as a remote, and inferring would aim the whole issue
workflow there.

### Matt Pocock's skills

Installed globally as the `mattpocock-skills` plugin, so nothing about them lives
in this repository. `setup-matt-pocock-skills` is `disable-model-invocation`, so
only the user can start it; when they do, it follows the redirections above.

Two of its sections need the fork's answers rather than its defaults:

- **Issue tracker** — GitHub, the fork's repository. Written to
  `.fork/agents/issue-tracker.md`.
- **Triage labels** — the five defaults are fine, created on the fork with an
  explicit `--repo` naming it. The upstream-write guard blocks the upstream
  spelling, but pass `--repo` anyway.

Where its other skills collide with fork procedure, fork procedure wins:
`resolving-merge-conflicts` does not govern a `fork-sync` rebase — conflicts
there are resolved against the manifest's intent line, as `fork-sync` describes.
