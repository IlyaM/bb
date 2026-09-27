import fs from "node:fs";
import Database from "better-sqlite3";
import { resolveThreadInvalidationDebounce } from "./baseline-debounce.js";

interface EventRow {
  thread_id: string;
  provider_id: string;
  item_id: string | null;
  item_kind: string | null;
  sequence: number;
  type: string;
  created_at: number;
  data: string;
}

interface Withhold {
  chars: number;
  ms: number;
}

interface StreamStats {
  provider: string;
  channel: string;
  items: number;
  deltas: number;
  chars: number;
  charLatencies: Withhold[];
  unresolvedChars: number;
  maxRunChars: number;
  maxRunMs: number;
  deltaIntervals: number[];
}

const DB_PATH =
  process.env.BB_BASELINE_SOURCE_DB ?? `${process.env.HOME}/.bb/bb.db`;
const OUT = process.env.BB_BASELINE_OUT ?? "/tmp/stream.json";
const THREAD_LIMIT = Number(process.env.BB_BASELINE_THREADS ?? "40");

const BURST_GAP_MS = Number(process.env.BB_BASELINE_BURST_GAP_MS ?? "1000");

function splitBursts(timestamps: readonly number[], gapMs: number): number[][] {
  const bursts: number[][] = [];
  let current: number[] = [];
  let previous: number | null = null;
  for (const ts of timestamps) {
    if (previous !== null && ts - previous > gapMs) {
      if (current.length > 0) bursts.push(current);
      current = [];
    }
    current.push(ts);
    previous = ts;
  }
  if (current.length > 0) bursts.push(current);
  return bursts;
}

const DELTA_CHANNELS: Record<string, string> = {
  "item/agentMessage/delta": "agentMessage",
  "item/reasoning/textDelta": "reasoning",
  "item/commandExecution/outputDelta": "commandOutput",
};

function deltaText(row: EventRow): string {
  const parsed = JSON.parse(row.data) as Record<string, unknown>;
  const value = parsed.delta ?? parsed.text ?? parsed.output;
  return typeof value === "string" ? value : "";
}

function finalText(row: EventRow): string | null {
  const parsed = JSON.parse(row.data) as Record<string, unknown>;
  const item = parsed.item as Record<string, unknown> | undefined;
  const content = item?.content;
  if (Array.isArray(content)) {
    const parts = content.filter(
      (part): part is string => typeof part === "string",
    );
    if (parts.length > 0) return parts.join("\n\n");
  }
  for (const candidate of [
    item?.text,
    item?.output,
    item?.result,
    parsed.text,
    parsed.output,
  ]) {
    if (typeof candidate === "string") return candidate;
  }
  return null;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function weightedPercentile(samples: readonly Withhold[], p: number): number {
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

function emptyStats(provider: string, channel: string): StreamStats {
  return {
    provider,
    channel,
    items: 0,
    deltas: 0,
    chars: 0,
    charLatencies: [],
    unresolvedChars: 0,
    maxRunChars: 0,
    maxRunMs: 0,
    deltaIntervals: [],
  };
}

interface Pending {
  chars: number;
  ts: number;
}

function replayItem(
  stats: StreamStats,
  deltas: readonly EventRow[],
  finalRow: EventRow | undefined,
): void {
  let pending: Pending[] = [];
  let previousTs: number | null = null;
  stats.items += 1;
  for (const row of deltas) {
    const text = deltaText(row);
    if (text.length === 0) continue;
    stats.deltas += 1;
    stats.chars += text.length;
    if (previousTs !== null)
      stats.deltaIntervals.push(row.created_at - previousTs);
    previousTs = row.created_at;

    if (!text.includes("\n")) {
      pending.push({ chars: text.length, ts: row.created_at });
      const runChars = pending.reduce((sum, item) => sum + item.chars, 0);
      const oldest = pending[0]?.ts ?? row.created_at;
      stats.maxRunChars = Math.max(stats.maxRunChars, runChars);
      stats.maxRunMs = Math.max(stats.maxRunMs, row.created_at - oldest);
      continue;
    }
    for (const item of pending) {
      stats.charLatencies.push({
        chars: item.chars,
        ms: row.created_at - item.ts,
      });
      stats.maxRunMs = Math.max(stats.maxRunMs, row.created_at - item.ts);
    }
    pending = [];
    const lastNewline = text.lastIndexOf("\n");
    const immediate = lastNewline + 1;
    stats.charLatencies.push({ chars: immediate, ms: 0 });
    const trailing = text.length - immediate;
    if (trailing > 0) pending.push({ chars: trailing, ts: row.created_at });
  }

  const pendingChars = pending.reduce((sum, item) => sum + item.chars, 0);
  if (pendingChars === 0) return;
  if (finalRow === undefined || finalText(finalRow) === null) {
    stats.unresolvedChars += pendingChars;
    return;
  }
  for (const item of pending) {
    stats.charLatencies.push({
      chars: item.chars,
      ms: finalRow.created_at - item.ts,
    });
    stats.maxRunMs = Math.max(stats.maxRunMs, finalRow.created_at - item.ts);
  }
  stats.maxRunChars = Math.max(stats.maxRunChars, pendingChars);
}

interface RepaintSimulation {
  changes: number;
  repaints: number;
  windowMs: number;
  fps: number;
}

function simulateRepaints(
  changeTimestamps: readonly number[],
  debounceMs: number,
  maxWaitMs: number,
): RepaintSimulation {
  let repaints = 0;
  let debounceDeadline: number | null = null;
  let maxWaitDeadline: number | null = null;
  let firstTs: number | null = null;
  let lastTs = 0;
  for (const ts of changeTimestamps) {
    if (firstTs === null) firstTs = ts;
    lastTs = ts;
    while (
      (debounceDeadline !== null && debounceDeadline <= ts) ||
      (maxWaitDeadline !== null && maxWaitDeadline <= ts)
    ) {
      repaints += 1;
      debounceDeadline = null;
      maxWaitDeadline = null;
      break;
    }
    debounceDeadline = ts + debounceMs;
    if (maxWaitDeadline === null) maxWaitDeadline = ts + maxWaitMs;
  }
  if (debounceDeadline !== null || maxWaitDeadline !== null) repaints += 1;
  const windowMs = firstTs === null ? 0 : lastTs - firstTs;
  return {
    changes: changeTimestamps.length,
    repaints,
    windowMs,
    fps: windowMs === 0 ? 0 : (repaints * 1000) / windowMs,
  };
}

interface ToolGap {
  provider: string;
  itemKind: string;
  gapMs: number;
}

function main(): void {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const providers = ["pi", "claude-code", "codex"];
  const statsByKey = new Map<string, StreamStats>();
  const toolGaps: ToolGap[] = [];
  const repaintRuns: (RepaintSimulation & {
    provider: string;
    threadId: string;
    pointer: "fine" | "coarse";
  })[] = [];

  for (const provider of providers) {
    const threadRows = db
      .prepare(
        `SELECT e.thread_id AS thread_id, COUNT(*) AS deltas
           FROM events e JOIN threads t ON t.id = e.thread_id
          WHERE t.provider_id = ? AND t.deleted_at IS NULL
            AND e.type IN ('item/agentMessage/delta','item/reasoning/textDelta','item/commandExecution/outputDelta')
          GROUP BY e.thread_id ORDER BY deltas DESC LIMIT ?`,
      )
      .all(provider, THREAD_LIMIT) as { thread_id: string; deltas: number }[];

    for (const thread of threadRows) {
      const rows = db
        .prepare(
          `SELECT thread_id, ? AS provider_id, item_id, item_kind, sequence, type, created_at, data
             FROM events WHERE thread_id = ? ORDER BY sequence ASC`,
        )
        .all(provider, thread.thread_id) as EventRow[];

      const byItem = new Map<string, EventRow[]>();
      const finals = new Map<string, EventRow>();
      let previousTs: number | null = null;
      for (const row of rows) {
        if (row.type === "item/started" && previousTs !== null) {
          const kind = row.item_kind ?? "unknown";
          if (kind.includes("ool") || kind.includes("ommand")) {
            toolGaps.push({
              provider,
              itemKind: kind,
              gapMs: row.created_at - previousTs,
            });
          }
        }
        previousTs = row.created_at;
        const channel = DELTA_CHANNELS[row.type];
        if (channel !== undefined && row.item_id !== null) {
          const key = `${channel}\u0000${row.item_id}`;
          const list = byItem.get(key);
          if (list === undefined) byItem.set(key, [row]);
          else list.push(row);
          continue;
        }
        if (row.type === "item/completed" && row.item_id !== null) {
          for (const channel of Object.values(DELTA_CHANNELS)) {
            finals.set(`${channel}\u0000${row.item_id}`, row);
          }
        }
      }

      for (const [key, deltas] of byItem) {
        const channel = key.split("\u0000")[0] ?? "unknown";
        const statsKey = `${provider}\u0000${channel}`;
        const stats = statsByKey.get(statsKey) ?? emptyStats(provider, channel);
        statsByKey.set(statsKey, stats);
        replayItem(stats, deltas, finals.get(key));
      }

      const changeTimestamps = rows
        .filter((row) => DELTA_CHANNELS[row.type] !== undefined)
        .map((row) => row.created_at);
      for (const burst of splitBursts(changeTimestamps, BURST_GAP_MS)) {
        if (burst.length < 20) continue;
        for (const pointer of ["fine", "coarse"] as const) {
          const { debounceMs, maxWaitMs } = resolveThreadInvalidationDebounce(
            pointer === "coarse",
          );
          repaintRuns.push({
            provider,
            threadId: thread.thread_id,
            pointer,
            ...simulateRepaints(burst, debounceMs, maxWaitMs),
          });
        }
      }
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    source: DB_PATH,
    threadsPerProvider: THREAD_LIMIT,
    channels: [...statsByKey.values()].map((stats) => ({
      provider: stats.provider,
      channel: stats.channel,
      items: stats.items,
      deltas: stats.deltas,
      chars: stats.chars,
      unresolvedChars: stats.unresolvedChars,
      charLatencyMs: {
        p50: weightedPercentile(stats.charLatencies, 50),
        p95: weightedPercentile(stats.charLatencies, 95),
        p99: weightedPercentile(stats.charLatencies, 99),
        max: stats.charLatencies.reduce((max, s) => Math.max(max, s.ms), 0),
      },
      sharePositiveLatency:
        stats.chars === 0
          ? 0
          : stats.charLatencies
              .filter((sample) => sample.ms > 0)
              .reduce((sum, sample) => sum + sample.chars, 0) / stats.chars,
      deltaIntervalMs: {
        p50: percentile(stats.deltaIntervals, 50),
        p95: percentile(stats.deltaIntervals, 95),
      },
      maxWithheldChars: stats.maxRunChars,
      maxWithheldMs: stats.maxRunMs,
    })),
    repaints: ["fine", "coarse"].map((pointer) => {
      const runs = repaintRuns.filter((run) => run.pointer === pointer);
      const fps = runs.map((run) => run.fps);
      const compression = runs.map(
        (run) => run.changes / Math.max(1, run.repaints),
      );
      return {
        pointer,
        threads: runs.length,
        fpsP50: percentile(fps, 50),
        fpsP05: percentile(fps, 5),
        fpsP95: percentile(fps, 95),
        changesPerRepaintP50: percentile(compression, 50),
      };
    }),
    toolGapMs: providers.map((provider) => {
      const gaps = toolGaps
        .filter((gap) => gap.provider === provider)
        .map((gap) => gap.gapMs);
      return {
        provider,
        samples: gaps.length,
        p50: percentile(gaps, 50),
        p95: percentile(gaps, 95),
        p99: percentile(gaps, 99),
      };
    }),
  };

  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\nwrote ${OUT}\n`);
}

main();
