import { describe, expect, it } from "vitest";
import { parseEvent } from "../src/events.js";

describe("parseEvent", () => {
  it("maps Codex notify payloads to completed events", () => {
    const event = parseEvent("codex", {
      type: "agent-turn-complete",
      "thread-id": "thread-1",
      "turn-id": "turn-1",
      cwd: "/tmp/demo",
      "input-messages": ["rename foo"],
      "last-assistant-message": "rename complete"
    });

    expect(event.tool).toBe("codex");
    expect(event.state).toBe("completed");
    expect(event.sessionId).toBe("thread-1");
    expect(event.project).toBe("demo");
    expect(event.summary).toBe("rename complete");
  });

  it("normalizes Codex summaries and preserves occurred_at timestamps", () => {
    const event = parseEvent("codex", {
      type: "agent-turn-complete",
      "thread-id": "thread-2",
      cwd: "/tmp/demo",
      "last-assistant-message": "  rename   complete \n",
      occurred_at: "2026-03-28T10:00:00Z"
    });

    expect(event.summary).toBe("rename complete");
    expect(event.occurredAt).toBe("2026-03-28T10:00:00Z");
  });

  it("supports Codex underscore-style aliases", () => {
    const event = parseEvent("codex", {
      type: "agent-turn-complete",
      session_id: "session-9",
      turn_id: "turn-9",
      cwd: "/tmp/alias-demo",
      last_assistant_message: "  alias   complete "
    });

    expect(event.sessionId).toBe("session-9");
    expect(event.project).toBe("alias-demo");
    expect(event.summary).toBe("alias complete");
  });

  it("maps Claude permission prompts to needs_input events", () => {
    const event = parseEvent(
      "claude",
      {
        session_id: "session-1",
        cwd: "/work/repo",
        notification_type: "permission_prompt",
        message: "Claude needs approval to run a command"
      },
      "Notification"
    );

    expect(event.tool).toBe("claude");
    expect(event.state).toBe("needs_input");
    expect(event.sessionId).toBe("session-1");
    expect(event.project).toBe("repo");
    expect(event.summary).toBe("Claude needs approval to run a command");
  });

  it("accepts Claude eventName from the payload when no third argument is provided", () => {
    const event = parseEvent("claude", {
      eventName: "Notification",
      session_id: "session-inline",
      cwd: "/work/repo",
      notification_type: "idle_prompt",
      message: " Claude is waiting for input "
    });

    expect(event.state).toBe("needs_input");
    expect(event.sessionId).toBe("session-inline");
    expect(event.summary).toBe("Claude is waiting for input");
  });

  it("maps Claude stop events to completed events", () => {
    const event = parseEvent(
      "claude",
      {
        session_id: "session-2",
        cwd: "/work/repo",
        message: "  All requested   changes are complete  ",
        occurredAt: "2026-03-28T11:00:00Z"
      },
      "Stop"
    );

    expect(event.tool).toBe("claude");
    expect(event.state).toBe("completed");
    expect(event.sessionId).toBe("session-2");
    expect(event.project).toBe("repo");
    expect(event.summary).toBe("All requested changes are complete");
    expect(event.occurredAt).toBe("2026-03-28T11:00:00Z");
  });

  it("maps Claude stop failures to failed events", () => {
    const event = parseEvent(
      "claude",
      {
        session_id: "session-3",
        cwd: "/work/repo",
        error_type: "rate_limit"
      },
      "StopFailure"
    );

    expect(event.tool).toBe("claude");
    expect(event.state).toBe("failed");
    expect(event.sessionId).toBe("session-3");
    expect(event.project).toBe("repo");
    expect(event.summary).toBe("Stop failure: rate_limit");
  });

  it("treats semantically identical Claude summaries as the same normalized string", () => {
    const first = parseEvent(
      "claude",
      {
        session_id: "session-4",
        cwd: "/work/repo",
        notification_type: "permission_prompt",
        message: "Claude   needs approval\tto run a command"
      },
      "Notification"
    );
    const second = parseEvent(
      "claude",
      {
        session_id: "session-5",
        cwd: "/work/repo",
        message: " Claude needs approval to run a command ",
        notification_type: "permission_prompt"
      },
      "Notification"
    );

    expect(first.summary).toBe("Claude needs approval to run a command");
    expect(second.summary).toBe("Claude needs approval to run a command");
  });
});
