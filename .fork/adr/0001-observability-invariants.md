# 0001 — Observability invariants for bb's thread view

bb hides most of what an agent does, and shows the rest late. Collapse withholds
80.7% of pi rows from the client; prose reaches the screen ≈590 ms after the
token arrives (p95 ≈3.5 s, worst 29.3 s), and ~57% of that p50 is an unbounded
wait for a newline (IlyaM/bb#4). None of it was ever specified: the newline gate
has no recorded rationale anywhere (IlyaM/bb#5), and one test pins it — on the
one input where it costs nothing (IlyaM/bb#3).

The three invariants below are what "bb shows what the agent is doing" means in
this fork. Every later change is tested against them, so that none of them is
re-argued change by change. They are bb-wide and provider-neutral: no
provider-conditional timeline, no pi-specific truths.

## 1. Nothing is withheld from the client

Everything the projection builds is delivered. A row is never folded away
server-side, and output is never reduced to a preview.

This is a claim about delivery, not about pixels. How the client spends vertical
space — height limits, scrolling, per-row affordances — is presentation, and is
IlyaM/bb#10's to design.

Violated today by collapse, which sends `children: null` for every folded row,
and by work-row output truncated to a 3 KB head+tail preview.

Check: the hidden-row census
(`apps/server/scripts/observability-baseline-census.ts`) reports a 0% hidden
share for every provider.

## 2. No visibility waits on an event that is not guaranteed to arrive

Any delay before content appears must be a stated, bounded number. Waiting on a
newline, a turn end, or a stream close is forbidden however short the usual case
is.

This permits batching and smoothing: a bounded coalescing window is a design
choice, not a violation. It forbids the newline gate outright — worst observed
wait 29.3 s for pi and 153 s for claude-code, on text that had already arrived —
and the assembler's untimed tail, which holds the last 6–18 characters until
`item.textClose`.

Check: the stream replay (`observability-baseline-stream.ts`) shows no withheld
run attributable to a boundary event.

## 3. A tool call is visible from its name onward, and its output is representable

A tool call appears as soon as its name is known, not when its arguments finish.
Every tool must have somewhere to put its output.

This is the invariant that makes protocol work mandatory rather than optional.
bb discards streaming tool-call events from every provider that emits them, so a
call is invisible for its whole argument-generation phase — 489 ms p50, 6.9 s p95
after the last visible event. `file-read` and `search` rows are worse than
hidden: bb never receives their content, so no thread-view change can show it.
The protocol shape is IlyaM/bb#13's; that it must exist is settled here.

Check: IlyaM/bb#13's protocol conformance, once decided.

## The budget

Token to visible character, end to end: **p50 ≤ 150 ms, p95 ≤ 400 ms, worst case
≤ 1 s**, measured on IlyaM/bb#4's harness.

Set by what is acceptable from the chair, not by what today's transport can
reach. The pull transport's measured repaint ceiling alone is ~240 ms (4.1 fps
desktop, 2.9 fps touch), so this budget may be unreachable without a push
transport — which is IlyaM/bb#9's decision on IlyaM/bb#8's evidence, not
something this charter pre-empts. A budget derived from the current architecture
would describe it rather than constrain it.

## Layout stability is deliberately not an invariant

The newline gate's only plausible unwritten purpose is avoiding a half-arrived
`**bold` or unclosed fence rendering as garbage and then reflowing. A day of real
work with the gate removed surfaced nothing objectionable (IlyaM/bb#3).

That evidence is weak, and it is recorded here as a justification for invariant
2's *bound* rather than as an invariant of its own. Naming "already-rendered text
does not reflow" as an invariant would hand a future reader a licence to
reintroduce an unbounded wait to satisfy it. If reflow turns out to matter, the
answer is a bound, never a boundary event.

## The test suite currently pins the rejected behaviour

`tool-activity-projection.test.ts > hides partial command output until a newline
or terminal flush` asserts invariant 2's violation. It must be inverted, not
deleted: the same input should assert immediate visibility.

The seven progress-throttle tests in `delta-assembler.test.ts` also fail under
IlyaM/bb#3's probe, but they **stand**. A 500 ms bounded throttle on ephemeral
progress messages is permitted by invariant 2; the probe zeroed it as part of
removing everything at once, not because the charter rejects it. What invariant 3
rejects is a throttled one-line progress message being a tool's *only* output
channel — that is the channel's fault, not the throttle's.
