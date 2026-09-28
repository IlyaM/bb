import fs from "node:fs";
import { createDeltaAssembler } from "@bb/provider-bridge-protocol/assembler";
import type { ThreadDelta } from "@bb/provider-bridge-protocol";
import { createEventSink } from "../src/event-sink.js";
import type { ThreadEvent } from "@bb/domain";

interface Sample {
  chars: number;
  ms: number;
}

function percentile(samples: readonly Sample[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a.ms - b.ms);
  const total = sorted.reduce((sum, sample) => sum + sample.chars, 0);
  const target = (p / 100) * total;
  let seen = 0;
  for (const sample of sorted) {
    seen += sample.chars;
    if (seen >= target) return sample.ms;
  }
  return sorted[sorted.length - 1]?.ms ?? 0;
}

function tokenize(text: string, tokenChars: number): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < text.length; index += tokenChars) {
    tokens.push(text.slice(index, index + tokenChars));
  }
  return tokens;
}

function prose(lineChars: number, lines: number): string {
  const word = "observability ";
  const line = word
    .repeat(Math.ceil(lineChars / word.length))
    .slice(0, lineChars);
  return Array.from({ length: lines }, () => line).join("\n") + "\n";
}

interface AssemblerRun {
  label: string;
  tokensPerSecond: number;
  tokenChars: number;
  chars: number;
  emittedEvents: number;
  coalesceLatencyMs: { p50: number; p95: number; max: number };
  tailCharsHeldUntilClose: number;
}

function runAssembler(args: {
  label: string;
  text: string;
  tokensPerSecond: number;
  tokenChars: number;
}): AssemblerRun {
  let clock = 0;
  const assembler = createDeltaAssembler({
    providerId: "bench",
    entropyPrefix: "bench0000",
    now: () => clock,
  });
  const threadId = "thr_bench";
  const key = { providerItemId: "item-1" };
  const pending: { chars: number; ts: number }[] = [];
  const samples: Sample[] = [];
  let emittedEvents = 0;

  const drain = (deltas: ThreadDelta[]): ThreadEvent[] =>
    assembler.assemble({ threadId, deltas });

  drain([
    { kind: "turn.open", providerTurnId: "turn-1" },
    {
      kind: "item.open",
      key,
      item: { type: "agentMessage", text: "" },
      providerTurnId: "turn-1",
    },
  ]);

  const tokens = tokenize(args.text, args.tokenChars);
  const stepMs = 1000 / args.tokensPerSecond;
  for (const token of tokens) {
    clock += stepMs;
    pending.push({ chars: token.length, ts: clock });
    const events = drain([
      {
        kind: "item.textDelta",
        key,
        channel: "agentMessage",
        text: token,
        providerTurnId: "turn-1",
      },
    ]);
    let emittedChars = 0;
    for (const event of events) {
      if (event.type !== "item/agentMessage/delta") continue;
      emittedEvents += 1;
      emittedChars += event.delta.length;
    }
    let remaining = emittedChars;
    while (remaining > 0 && pending.length > 0) {
      const head = pending[0];
      if (head === undefined) break;
      const taken = Math.min(head.chars, remaining);
      samples.push({ chars: taken, ms: clock - head.ts });
      head.chars -= taken;
      remaining -= taken;
      if (head.chars === 0) pending.shift();
    }
  }

  const tailChars = pending.reduce((sum, item) => sum + item.chars, 0);
  clock += stepMs;
  drain([
    {
      kind: "item.textClose",
      key,
      channel: "agentMessage",
      text: args.text,
      providerTurnId: "turn-1",
    },
    {
      kind: "item.close",
      key,
      status: "completed",
      item: { type: "agentMessage", text: args.text },
      providerTurnId: "turn-1",
    },
  ]);
  for (const item of pending) {
    samples.push({ chars: item.chars, ms: clock - item.ts });
  }

  return {
    label: args.label,
    tokensPerSecond: args.tokensPerSecond,
    tokenChars: args.tokenChars,
    chars: args.text.length,
    emittedEvents,
    coalesceLatencyMs: {
      p50: percentile(samples, 50),
      p95: percentile(samples, 95),
      max: samples.reduce((max, sample) => Math.max(max, sample.ms), 0),
    },
    tailCharsHeldUntilClose: tailChars,
  };
}

async function runEventSink(eventCount: number, intervalMs: number) {
  const latencies: number[] = [];
  const emittedAt = new Map<string, number>();
  const sink = createEventSink({
    isSessionOpen: () => true,
    logger: { debug: () => {}, error: () => {}, warn: () => {} },
    postEvents: async (envelopes) => {
      const now = performance.now();
      for (const envelope of envelopes) {
        const started = emittedAt.get(envelope.event.id);
        if (started !== undefined) latencies.push(now - started);
      }
      return {
        acceptedEvents: envelopes.map((envelope, index) => ({
          eventId: envelope.event.id,
          eventIndex: index,
          sequence: index,
          threadId: envelope.threadId,
        })),
        rejectedEvents: [],
      };
    },
  });

  for (let index = 0; index < eventCount; index += 1) {
    const event = {
      id: `evt_bench_${index}`,
      type: "item/agentMessage/delta",
      itemId: "item-1",
      providerThreadId: "provider-thread",
      delta: "token ",
    } as unknown as ThreadEvent;
    emittedAt.set(event.id, performance.now());
    sink.emit({ event, threadId: "thr_bench" });
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  await sink.flush();
  await sink.dispose();
  const sorted = [...latencies].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[
      Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
      )
    ] ?? 0;
  return {
    events: eventCount,
    intervalMs,
    samples: sorted.length,
    p50: at(50),
    p95: at(95),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

async function main(): Promise<void> {
  const paragraphNoNewline = "observability ".repeat(45).slice(0, 600);
  const assembler = [
    runAssembler({
      label: "prose 80-char lines",
      text: prose(80, 30),
      tokensPerSecond: 20,
      tokenChars: 4,
    }),
    runAssembler({
      label: "prose 80-char lines (fast)",
      text: prose(80, 30),
      tokensPerSecond: 60,
      tokenChars: 4,
    }),
    runAssembler({
      label: "600-char paragraph, no newline",
      text: paragraphNoNewline,
      tokensPerSecond: 20,
      tokenChars: 4,
    }),
    runAssembler({
      label: "600-char paragraph, no newline (fast)",
      text: paragraphNoNewline,
      tokensPerSecond: 60,
      tokenChars: 4,
    }),
  ];
  const sink = [await runEventSink(60, 25), await runEventSink(60, 120)];
  const out = process.env.BB_BASELINE_OUT ?? "/tmp/hops.json";
  const summary = { generatedAt: new Date().toISOString(), assembler, sink };
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\nwrote ${out}\n`);
}

void main();
