import type { NormalizedEvent, NormalizedState } from "../src/events.js";

interface MakeEventOptions {
  tool?: NormalizedEvent["tool"];
  state?: NormalizedState;
  sessionId?: string;
  cwd?: string;
  project?: string;
  summary?: string;
  rawEvent?: Record<string, unknown>;
  occurredAt?: string;
}

export function makeEvent(options: MakeEventOptions = {}): NormalizedEvent {
  const summary = options.summary ?? "done";

  return {
    tool: options.tool ?? "claude",
    state: options.state ?? "completed",
    sessionId: options.sessionId ?? "session-1",
    cwd: options.cwd ?? "/tmp/demo",
    project: options.project ?? "demo",
    summary,
    rawEvent: options.rawEvent ?? { summary },
    occurredAt: options.occurredAt ?? "2026-03-28T12:00:00.000Z"
  };
}

export class TestClock {
  constructor(private currentMs: number) {}

  now(): Date {
    return new Date(this.currentMs);
  }

  advanceByMs(ms: number): void {
    this.currentMs += ms;
  }
}
