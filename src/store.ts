import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { NormalizedEvent } from "./events.js";

export interface EventStoreOptions {
  dedupeSeconds: number;
  maxEntries?: number;
  maxAgeDays?: number;
  now?: () => Date;
}

interface EventRecord {
  tool: NormalizedEvent["tool"];
  state: NormalizedEvent["state"];
  session_id: string;
  cwd: string;
  project: string;
  summary: string;
  occurred_at: string;
  raw_event: Record<string, unknown>;
}

export class EventStore {
  readonly logPath: string;
  readonly dedupePath: string;

  private readonly dedupeSeconds: number;
  private readonly maxEntries: number;
  private readonly maxAgeDays: number;
  private readonly now: () => Date;

  constructor(stateDir: string, options: EventStoreOptions) {
    this.logPath = join(stateDir, "events.jsonl");
    this.dedupePath = join(stateDir, "dedupe.json");
    this.dedupeSeconds = options.dedupeSeconds;
    this.maxEntries = options.maxEntries ?? 5000;
    this.maxAgeDays = options.maxAgeDays ?? 7;
    this.now = options.now ?? (() => new Date());
  }

  async shouldEmit(event: NormalizedEvent): Promise<boolean> {
    const dedupe = this.pruneDedupe(await this.loadDedupe());
    await this.writeDedupe(dedupe);
    return !(this.eventKey(event) in dedupe);
  }

  async record(event: NormalizedEvent): Promise<void> {
    const dedupe = this.pruneDedupe(await this.loadDedupe());
    dedupe[this.eventKey(event)] = this.now().toISOString();
    await this.writeDedupe(dedupe);

    const entries = await this.readLog();
    entries.push(this.toRecord(event));
    await this.writeLog(this.pruneLogEntries(entries));
  }

  async readLog(): Promise<EventRecord[]> {
    await this.ensureStateDir();

    let content: string;
    try {
      content = await readFile(this.logPath, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }
      throw error;
    }

    const entries: EventRecord[] = [];

    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      try {
        const parsed = JSON.parse(line);
        if (isEventRecord(parsed)) {
          entries.push(parsed);
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          continue;
        }
        throw error;
      }
    }

    return entries;
  }

  private eventKey(event: NormalizedEvent): string {
    const summaryHash = createHash("sha256").update(event.summary, "utf8").digest("hex");
    return `${event.tool}|${event.sessionId}|${event.state}|${summaryHash}`;
  }

  private async ensureStateDir(): Promise<void> {
    await mkdir(dirname(this.logPath), { recursive: true });
  }

  private async loadDedupe(): Promise<Record<string, string>> {
    await this.ensureStateDir();

    try {
      const content = await readFile(this.dedupePath, "utf8");
      return normalizeDedupeState(JSON.parse(content));
    } catch (error) {
      if (isMissingFileError(error) || error instanceof SyntaxError) {
        return {};
      }
      throw error;
    }
  }

  private async writeDedupe(data: Record<string, string>): Promise<void> {
    await this.ensureStateDir();
    await this.atomicWriteFile(this.dedupePath, `${JSON.stringify(data, null, 2)}\n`);
  }

  private pruneDedupe(data: Record<string, string>): Record<string, string> {
    const cutoff = this.now().getTime() - this.dedupeSeconds * 1000;
    const pruned: Record<string, string> = {};

    for (const [key, timestamp] of Object.entries(data)) {
      const value = Date.parse(timestamp);
      if (Number.isNaN(value)) {
        continue;
      }
      if (value >= cutoff) {
        pruned[key] = new Date(value).toISOString();
      }
    }

    return pruned;
  }

  private pruneLogEntries(entries: EventRecord[]): EventRecord[] {
    const cutoff = this.now().getTime() - this.maxAgeDays * 24 * 60 * 60 * 1000;
    const kept = entries.filter((entry) => {
      const occurredAt = Date.parse(entry.occurred_at);
      return !Number.isNaN(occurredAt) && occurredAt >= cutoff;
    });

    return kept.slice(-this.maxEntries);
  }

  private async writeLog(entries: EventRecord[]): Promise<void> {
    await this.ensureStateDir();
    const content =
      entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length > 0 ? "\n" : "");
    await this.atomicWriteFile(this.logPath, content);
  }

  private toRecord(event: NormalizedEvent): EventRecord {
    return {
      tool: event.tool,
      state: event.state,
      session_id: event.sessionId,
      cwd: event.cwd,
      project: event.project,
      summary: event.summary,
      occurred_at: event.occurredAt,
      raw_event: event.rawEvent
    };
  }

  private async atomicWriteFile(path: string, content: string): Promise<void> {
    const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, path);
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function normalizeDedupeState(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) {
    return {};
  }

  const normalized: Record<string, string> = {};

  for (const [key, timestamp] of Object.entries(value)) {
    if (typeof timestamp === "string") {
      normalized[key] = timestamp;
    }
  }

  return normalized;
}

function isEventRecord(value: unknown): value is EventRecord {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    isString(value.tool) &&
    isString(value.state) &&
    isString(value.session_id) &&
    isString(value.cwd) &&
    isString(value.project) &&
    isString(value.summary) &&
    isString(value.occurred_at) &&
    isPlainObject(value.raw_event)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
