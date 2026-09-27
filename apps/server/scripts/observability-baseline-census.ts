import fs from "node:fs";
import Database from "better-sqlite3";
import {
  createConnection,
  createProject,
  getLatestThreadSequence,
  getThread,
  migrate,
  noopNotifier,
  threads as threadsTable,
  upsertHost,
} from "@bb/db";
import type { DbConnection } from "@bb/db";
import { defaultFeatureFlags } from "@bb/domain";
import type { CompletedTurnDisplay, Thread } from "@bb/domain";
import type { ThreadTimelineResponse, TimelineRow } from "@bb/server-contract";
import { sql } from "drizzle-orm";
import {
  THREAD_TIMELINE_DEFAULT_SEGMENT_LIMIT,
  buildThreadTimelineWithProfile,
} from "../src/services/threads/timeline.js";
import type { ThreadTimelinePageRequest } from "../src/services/threads/timeline-pagination.js";
import { previewTimelineResponseOutputs } from "../src/services/threads/timeline-output-preview.js";
import {
  DEFAULT_MAX_INLINE_OUTPUT_CHARS,
  truncateTimelineResponseOutputs,
} from "../src/services/threads/timeline-output-truncation.js";
import { clearStoredEventDecodeCache } from "../src/services/threads/stored-event-decode-cache.js";
import { clearTimelineSelectionMemo } from "../src/services/threads/timeline-selection-memo.js";

interface SourceThreadRow {
  id: string;
  provider_id: string;
  title: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  deleted_at: number | null;
  parent_thread_id: string | null;
  origin_kind: string | null;
  visibility: string;
  model_override: string | null;
  reasoning_level_override: string | null;
  event_rows: number;
}

interface SourceEventRow {
  id: string;
  thread_id: string;
  scope_kind: string;
  turn_id: string | null;
  provider_thread_id: string | null;
  sequence: number;
  type: string;
  item_id: string | null;
  item_kind: string | null;
  parent_tool_call_id: string | null;
  data: string;
  created_at: number;
}

interface RowCensus {
  messageRows: number;
  summaryRows: number;
  summarizedCount: number;
  previewedRows: number;
  workRows: number;
  outputChars: number;
}

interface ThreadCensus {
  threadId: string;
  provider: string;
  eventRows: number;
  turns: number;
  flatNested: RowCensus;
  collapseDefault: RowCensus;
  flatDefault: RowCensus;
  pages: number;
  buildMsCollapse: number[];
  buildMsFlat: number[];
}

const DB_PATH =
  process.env.BB_BASELINE_SOURCE_DB ?? `${process.env.HOME}/.bb/bb.db`;
const PER_PROVIDER = Number(process.env.BB_BASELINE_THREADS ?? "20");
const OUT = process.env.BB_BASELINE_OUT ?? "/tmp/census.json";

function emptyCensus(): RowCensus {
  return {
    messageRows: 0,
    summaryRows: 0,
    summarizedCount: 0,
    previewedRows: 0,
    workRows: 0,
    outputChars: 0,
  };
}

function accumulate(census: RowCensus, rows: readonly TimelineRow[]): void {
  for (const row of rows) {
    if (row.kind === "turn") {
      census.summaryRows += 1;
      census.summarizedCount += row.summaryCount ?? 0;
      if (row.children !== null) accumulate(census, row.children);
      continue;
    }
    census.messageRows += 1;
    if (row.kind === "work") {
      census.workRows += 1;
      if ("output" in row && typeof row.output === "string") {
        census.outputChars += row.output.length;
      }
      if ("outputPreview" in row && row.outputPreview)
        census.previewedRows += 1;
    }
  }
}

function loadThreadIntoDb(
  row: SourceThreadRow,
  events: SourceEventRow[],
): {
  db: DbConnection;
  thread: Thread;
  close: () => void;
} {
  const db = createConnection(":memory:");
  migrate(db);
  const host = upsertHost(db, noopNotifier, { name: "baseline-host" });
  const { project } = createProject(db, noopNotifier, {
    name: "baseline",
    source: { type: "local_path", hostId: host.id, path: "/baseline" },
  });
  db.transaction(
    (tx) => {
      tx.insert(threadsTable)
        .values({
          id: row.id,
          projectId: project.id,
          environmentId: null,
          providerId: row.provider_id,
          modelOverride: row.model_override,
          reasoningLevelOverride: row.reasoning_level_override as never,
          title: row.title,
          titleFallback: null,
          sectionId: null,
          status: row.status as never,
          parentThreadId: null,
          sourceThreadId: null,
          originKind: row.origin_kind as never,
          originPluginId: null,
          visibility: row.visibility as never,
          archivedAt: row.archived_at,
          pinnedAt: null,
          pinSortKey: null,
          deletedAt: row.deleted_at,
          lastReadAt: null,
          latestAttentionAt: row.updated_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })
        .run();
      for (const event of events) {
        tx.run(
          sql`INSERT INTO events (id, thread_id, environment_id, scope_kind, turn_id, provider_thread_id, sequence, type, item_id, item_kind, parent_tool_call_id, data, created_at)
              VALUES (${event.id}, ${event.thread_id}, ${null}, ${event.scope_kind}, ${event.turn_id}, ${event.provider_thread_id}, ${event.sequence}, ${event.type}, ${event.item_id}, ${event.item_kind}, ${event.parent_tool_call_id}, ${event.data}, ${event.created_at})`,
        );
      }
    },
    { behavior: "immediate" },
  );
  const thread = getThread(db, row.id);
  if (!thread) throw new Error(`thread ${row.id} did not load`);
  return { db, thread, close: () => db.$client.close() };
}

function buildPages(args: {
  db: DbConnection;
  thread: Thread;
  completedTurnDisplay: CompletedTurnDisplay;
  includeNestedRows: boolean;
}): { responses: ThreadTimelineResponse[]; buildMs: number[] } {
  const maxSeq = getLatestThreadSequence(args.db, { threadId: args.thread.id });
  const responses: ThreadTimelineResponse[] = [];
  const buildMs: number[] = [];
  let page: ThreadTimelinePageRequest = {
    kind: "latest",
    segmentLimit: THREAD_TIMELINE_DEFAULT_SEGMENT_LIMIT,
  };
  const seen = new Set<string>();
  for (;;) {
    clearStoredEventDecodeCache(args.db);
    clearTimelineSelectionMemo(args.db);
    const started = performance.now();
    const { response } = buildThreadTimelineWithProfile(args.db, args.thread, {
      completedTurnDisplay: args.completedTurnDisplay,
      eventBudget: defaultFeatureFlags.timelineWindowEventBudget,
      includeDiagnosticOperations: true,
      includeNestedRows: args.includeNestedRows,
      maxInlineOutputChars: DEFAULT_MAX_INLINE_OUTPUT_CHARS,
      maxSeq,
      page,
      summaryOnly: false,
    });
    buildMs.push(performance.now() - started);
    const truncated = truncateTimelineResponseOutputs(
      response,
      DEFAULT_MAX_INLINE_OUTPUT_CHARS,
    );
    responses.push(
      args.includeNestedRows
        ? truncated
        : previewTimelineResponseOutputs(truncated),
    );
    const { hasOlderRows, olderCursor } = response.timelinePage;
    if (!hasOlderRows || olderCursor === null) return { responses, buildMs };
    const key = `${olderCursor.anchorId}\0${olderCursor.anchorSeq}`;
    if (seen.has(key)) return { responses, buildMs };
    seen.add(key);
    page = {
      kind: "older",
      segmentLimit: THREAD_TIMELINE_DEFAULT_SEGMENT_LIMIT,
      beforeCursor: olderCursor,
    };
  }
}

function censusOf(responses: readonly ThreadTimelineResponse[]): RowCensus {
  const census = emptyCensus();
  for (const response of responses) accumulate(census, response.rows);
  return census;
}

function main(): void {
  const source = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const providers = ["pi", "claude-code", "codex"];
  const selected: SourceThreadRow[] = [];
  for (const provider of providers) {
    const rows = source
      .prepare(
        `SELECT t.id, t.provider_id, t.title, t.status, t.created_at, t.updated_at,
                t.archived_at, t.deleted_at, t.parent_thread_id, t.origin_kind,
                t.visibility, t.model_override, t.reasoning_level_override,
                COUNT(e.id) AS event_rows
           FROM threads t JOIN events e ON e.thread_id = t.id
          WHERE t.provider_id = ? AND t.deleted_at IS NULL AND t.status = 'idle'
          GROUP BY t.id
         HAVING event_rows >= 40
          ORDER BY event_rows DESC
          LIMIT ?`,
      )
      .all(provider, PER_PROVIDER) as SourceThreadRow[];
    selected.push(...rows);
  }

  const results: ThreadCensus[] = [];
  const eventStatement = source.prepare(
    `SELECT id, thread_id, scope_kind, turn_id, provider_thread_id, sequence, type,
            item_id, item_kind, parent_tool_call_id, data, created_at
       FROM events WHERE thread_id = ? ORDER BY sequence ASC`,
  );
  for (const row of selected) {
    const events = eventStatement.all(row.id) as SourceEventRow[];
    const loaded = loadThreadIntoDb(row, events);
    try {
      const collapse = buildPages({
        db: loaded.db,
        thread: loaded.thread,
        completedTurnDisplay: "collapse",
        includeNestedRows: false,
      });
      const flatDefault = buildPages({
        db: loaded.db,
        thread: loaded.thread,
        completedTurnDisplay: "flat",
        includeNestedRows: false,
      });
      const flatNested = buildPages({
        db: loaded.db,
        thread: loaded.thread,
        completedTurnDisplay: "flat",
        includeNestedRows: true,
      });
      results.push({
        threadId: row.id,
        provider: row.provider_id,
        eventRows: events.length,
        turns: new Set(events.map((event) => event.turn_id).filter(Boolean))
          .size,
        collapseDefault: censusOf(collapse.responses),
        flatDefault: censusOf(flatDefault.responses),
        flatNested: censusOf(flatNested.responses),
        pages: collapse.responses.length,
        buildMsCollapse: collapse.buildMs,
        buildMsFlat: flatDefault.buildMs,
      });
      process.stdout.write(
        `${row.provider_id} ${row.id} events=${events.length} collapse=${censusOf(collapse.responses).messageRows}+${censusOf(collapse.responses).summaryRows}turns flat=${censusOf(flatDefault.responses).messageRows}\n`,
      );
    } finally {
      loaded.close();
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  process.stdout.write(`wrote ${OUT} (${results.length} threads)\n`);
}

main();
