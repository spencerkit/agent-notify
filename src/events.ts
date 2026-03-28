export type NormalizedState = "completed" | "needs_input" | "failed";

export interface NormalizedEvent {
  tool: "codex" | "claude";
  state: NormalizedState;
  sessionId: string;
  cwd: string;
  project: string;
  summary: string;
  rawEvent: Record<string, unknown>;
  occurredAt: string;
}

export function parseEvent(
  tool: "codex" | "claude",
  rawEvent: Record<string, unknown>,
  eventName?: string
): NormalizedEvent {
  if (tool === "codex") {
    return parseCodexEvent(rawEvent);
  }

  return parseClaudeEvent(rawEvent, eventName);
}

function parseCodexEvent(rawEvent: Record<string, unknown>): NormalizedEvent {
  if (rawEvent.type !== "agent-turn-complete") {
    throw new Error("unsupported Codex payload");
  }

  const cwd = getString(rawEvent.cwd, ".");

  return {
    tool: "codex",
    state: "completed",
    sessionId: getString(
      rawEvent["thread-id"],
      getString(
        rawEvent["thread_id"],
        getString(
          rawEvent["session_id"],
          getString(rawEvent["turn-id"], getString(rawEvent["turn_id"], "unknown"))
        )
      )
    ),
    cwd,
    project: projectFromCwd(cwd),
    summary: normalizeSummary(
      rawEvent["last-assistant-message"],
      getString(rawEvent["last_assistant_message"], "Codex completed a turn")
    ),
    rawEvent,
    occurredAt: toOccurredAt(rawEvent)
  };
}

function parseClaudeEvent(
  rawEvent: Record<string, unknown>,
  eventName?: string
): NormalizedEvent {
  const normalizedEventName = getString(eventName, getString(rawEvent.eventName, ""));
  const notificationType = getString(
    rawEvent.notification_type,
    getString(rawEvent.notificationType, "")
  );
  const cwd = getString(rawEvent.cwd, ".");
  const sessionId = getString(rawEvent.session_id, getString(rawEvent.sessionId, "unknown"));

  if (
    normalizedEventName === "Notification" &&
    ["permission_prompt", "idle_prompt", "elicitation_dialog"].includes(notificationType)
  ) {
    return {
      tool: "claude",
      state: "needs_input",
      sessionId,
      cwd,
      project: projectFromCwd(cwd),
      summary: normalizeSummary(
        rawEvent.message,
        `Claude notification: ${notificationType || "attention required"}`
      ),
      rawEvent,
      occurredAt: toOccurredAt(rawEvent)
    };
  }

  if (normalizedEventName === "Stop") {
    return {
      tool: "claude",
      state: "completed",
      sessionId,
      cwd,
      project: projectFromCwd(cwd),
      summary: normalizeSummary(
        rawEvent.last_assistant_message,
        getString(rawEvent.message, "Claude completed a task")
      ),
      rawEvent,
      occurredAt: toOccurredAt(rawEvent)
    };
  }

  if (normalizedEventName === "StopFailure") {
    const errorType = getString(rawEvent.error_type, getString(rawEvent.errorType, "unknown"));

    return {
      tool: "claude",
      state: "failed",
      sessionId,
      cwd,
      project: projectFromCwd(cwd),
      summary: normalizeSummary(rawEvent.message, `Stop failure: ${errorType}`),
      rawEvent,
      occurredAt: toOccurredAt(rawEvent)
    };
  }

  throw new Error(`unsupported Claude payload: ${normalizedEventName || "unknown"}`);
}

function getString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function normalizeSummary(value: unknown, fallback: string): string {
  const candidate = typeof value === "string" ? value : fallback;
  const normalized = candidate.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : fallback;
}

function projectFromCwd(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  return parts.at(-1) ?? cwd;
}

function toOccurredAt(rawEvent: Record<string, unknown>): string {
  const value =
    typeof rawEvent.occurredAt === "string" && rawEvent.occurredAt.length > 0
      ? rawEvent.occurredAt
      : rawEvent.occurred_at;

  return typeof value === "string" && value.length > 0
    ? value
    : new Date().toISOString();
}
