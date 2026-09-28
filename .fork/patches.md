# Patch manifest

Branch order for rebasing and selected merges into `fork`, one row per branch.
The intent line is the context a rebase conflict is resolved against, so write
it as the reason the change exists, not as a summary of the diff.

| Branch | Intent | Issue | Upstream | Integration |
| --- | --- | --- | --- | --- |
| patch/assistant-prose-timer | Assistant prose and streamed output must become visible within a finite bound without relying on a newline, a later provider event, or turn completion, while preserving bounded progress throttling. | IlyaM/bb#19 | not submitted | include |
| patch/flat-chronological-thread-rows | Completed provider turns must retain every distinct chronological activity row and send complete row content to browser and CLI/SDK by default, without inferred bundles or preview-only output. | IlyaM/bb#20 | not submitted | hold |
| patch/codex-mcp-results | Preserve completed Codex MCP outcomes already supplied by the provider, including failures, so thread readers and existing thread consumers can inspect them without a live-streaming dependency. | IlyaM/bb#18 | not submitted | hold |
| patch/distinct-activity-history | Keep each distinct plan, question, delegation, tool and failure in chronological history beside live-state cards, without hiding failed activities or exposing lifecycle duplicates as new work. | IlyaM/bb#22 | not submitted | hold |
| local/observability-baseline | The observability effort needs its measurements re-takeable rather than re-derived, so IlyaM/bb#4's numbers and IlyaM/bb#8's comparison run from committed scripts. They import @bb/db and @bb/server-contract, so they live inside apps/*/scripts rather than under .fork/. | IlyaM/bb#4 | never | include |
| local/observability-research | Keep the primary-source lifecycle comparison and visual map available to later wayfinding sessions independently of ephemeral BB thread storage, so the decisions about tool protocol and extensibility can be revisited with their evidence. | IlyaM/bb#13 | never | include |
| patch/named-tool-generic-outcome | A named provider tool needs one durable call identity and complete generic final outcome so readers and existing clients can follow its execution without classification losing evidence. | IlyaM/bb#25 | not submitted | hold |

`main` is not listed: it is always the base of the rebuild. `Integration` is
explicit: `include` merges the branch into `fork`; `hold` keeps it recorded and
rebased but out of `fork`. New `patch/` rows start as `hold` until deliberately
selected; new `local/` rows start as `include`. A missing or unrecognized value
stops the rebuild rather than implying inclusion.

The Issue column holds a fork issue as `IlyaM/bb#N`, always spelled with the
owner. A bare `#N` is ambiguous once the text reaches an upstream pull request,
where GitHub resolves it against `get-bb/bb`.

Add a row when you create a branch (`fork-patch` skill). Delete the row when the
patch lands upstream or is abandoned (`fork-sync` skill). `fork-sync` fails if
this table and the actual `patch/*` and `local/*` branches disagree.
