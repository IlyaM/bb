# Patch manifest

Merge order for rebuilding `fork`, one row per branch. The intent line is the
context a rebase conflict is resolved against, so write it as the reason the
change exists, not as a summary of the diff.

| Branch | Intent | Issue | Upstream |
| --- | --- | --- | --- |

`main` is not listed: it is always the base of the rebuild.

The Issue column holds a fork issue as `IlyaM/bb#N`, always spelled with the
owner. A bare `#N` is ambiguous once the text reaches an upstream pull request,
where GitHub resolves it against `get-bb/bb`.

Add a row when you create a branch (`fork-patch` skill). Delete the row when the
patch lands upstream or is abandoned (`fork-sync` skill). `fork-sync` fails if
this table and the actual `patch/*` and `local/*` branches disagree.
