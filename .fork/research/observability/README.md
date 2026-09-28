# Tool lifecycle research

Evidence gathered for [Decide how the delta protocol should represent a tool call still being written](https://github.com/IlyaM/bb/issues/13) and the follow-on [How should tool-specific presentation extend bb, including pi extension tools?](https://github.com/IlyaM/bb/issues/16).

- [Visual comparison](tool-lifecycle-visual.html) — self-contained HTML diagrams of lifecycle phases, native harness differences, and bb's translation/projection gaps. To show it inline in BB from a checkout containing this directory: `::inline-vis{file=".fork/research/observability/tool-lifecycle-visual.html" height=900}`.
- [Detailed report](tool-lifecycle-native-harnesses-vs-bb.md) — primary-source comparison across pi, Claude Code, Codex, ACP and bb; bb source links point to the commit used during research, and pi links to tagged v0.87.1 source.
- [Pi TUI source trace](pi-tui-tool-streaming.md) — closer trace of partial arguments, tool execution and rendering in installed pi 0.87.1.

These are research artifacts, not a protocol specification. The issue resolution is authoritative for decisions; some native integrations and versions change independently of this snapshot. In particular, pi read/grep currently use bb's generic tool rows and retain final output; bb's specialized file-read/search rows from other provider bridges lack result bodies.
