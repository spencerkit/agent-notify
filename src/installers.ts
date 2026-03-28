function renderTomlArray(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function firstTomlTableIndex(text: string): number {
  const match = text.match(/^[ \t]*\[/m);
  return match?.index ?? -1;
}

function hasNonTopLevelAssignment(text: string, key: string): boolean {
  const searchLimit = firstTomlTableIndex(text);
  if (searchLimit === -1) {
    return false;
  }

  const tableText = text.slice(searchLimit);
  const pattern = new RegExp(`^[ \\t]*${key}[ \\t]*=`, "m");
  return pattern.test(tableText);
}

function findTopLevelAssignmentSpan(text: string, key: string): [number, number] | null {
  const searchLimit = firstTomlTableIndex(text);
  const searchText = searchLimit === -1 ? text : text.slice(0, searchLimit);
  const marker = key;
  let start = searchText.indexOf(marker);

  while (start !== -1) {
    const lineStart = searchText.lastIndexOf("\n", start) + 1;
    const prefix = searchText.slice(lineStart, start).trim();

    if (prefix.length > 0) {
      start = searchText.indexOf(marker, start + marker.length);
      continue;
    }

    let cursor = start + marker.length;

    while (cursor < searchText.length && /\s/.test(searchText[cursor]!)) {
      cursor += 1;
    }

    if (cursor >= searchText.length || searchText[cursor] !== "=") {
      start = searchText.indexOf(marker, start + marker.length);
      continue;
    }

    cursor += 1;

    while (cursor < searchText.length && /\s/.test(searchText[cursor]!)) {
      cursor += 1;
    }

    if (cursor < searchText.length && searchText[cursor] === "[") {
      let depth = 0;
      let inDoubleQuotedString = false;
      let inSingleQuotedString = false;
      let inComment = false;
      let escaped = false;

      for (let index = cursor; index < searchText.length; index += 1) {
        const char = searchText[index]!;

        if (inComment) {
          if (char === "\n") {
            inComment = false;
          }
          continue;
        }

        if (inDoubleQuotedString) {
          if (escaped) {
            escaped = false;
          } else if (char === "\\") {
            escaped = true;
          } else if (char === "\"") {
            inDoubleQuotedString = false;
          }

          continue;
        }

        if (inSingleQuotedString) {
          if (char === "'") {
            inSingleQuotedString = false;
          }

          continue;
        }

        if (char === "\"") {
          inDoubleQuotedString = true;
          continue;
        }

        if (char === "'") {
          inSingleQuotedString = true;
          continue;
        }

        if (char === "#") {
          inComment = true;
          continue;
        }

        if (char === "[") {
          depth += 1;
          continue;
        }

        if (char === "]") {
          depth -= 1;
          if (depth === 0) {
            let end = index + 1;

            while (end < searchText.length && /[ \t]/.test(searchText[end]!)) {
              end += 1;
            }

            if (end < searchText.length && searchText[end] === "#") {
              while (end < searchText.length && searchText[end] !== "\n") {
                end += 1;
              }
            }

            if (end < searchText.length && searchText[end] === "\n") {
              end += 1;
            }

            return [start, end];
          }
        }
      }

      throw new TypeError(`Unterminated top-level ${key} array assignment in Codex config.`);
    }

    const lineEnd = searchText.indexOf("\n", cursor);
    const end = lineEnd === -1 ? searchText.length : lineEnd + 1;
    return [start, end];
  }

  return null;
}

function shellJoin(argv: readonly string[]): string {
  return argv
    .map((part) => {
      if (/^[A-Za-z0-9_./:-]+$/.test(part)) {
        return part;
      }

      return `'${part.replace(/'/g, `'\\''`)}'`;
    })
    .join(" ");
}

export function buildCodexNotifyCommand(command = "agent-notify"): string[] {
  return [command, "handle", "codex"];
}

export function buildClaudeCommandPrefix(command = "agent-notify"): string[] {
  return [command];
}

export function patchCodexConfig(currentText: string, commandArgv: readonly string[]): string {
  const replacement = `notify = ${renderTomlArray(commandArgv)}\n`;

  if (hasNonTopLevelAssignment(currentText, "notify")) {
    throw new TypeError("Found non-top-level notify assignment in Codex config.");
  }

  const existingSpan = findTopLevelAssignmentSpan(currentText, "notify");

  if (existingSpan) {
    const [start, end] = existingSpan;
    return currentText.slice(0, start) + replacement + currentText.slice(end);
  }

  const tableIndex = firstTomlTableIndex(currentText);
  if (tableIndex !== -1) {
    const prefix = currentText.slice(0, tableIndex).replace(/\n+$/, "");
    const suffix = currentText.slice(tableIndex).replace(/^\n+/, "");
    const parts = [prefix, replacement.trimEnd(), suffix].filter((part) => part.length > 0);
    return `${parts.join("\n\n").replace(/\n+$/, "")}\n`;
  }

  const base = currentText.replace(/\n+$/, "");
  return base.length > 0 ? `${base}\n${replacement}` : replacement;
}

export function patchClaudeSettings(currentText: string, commandPrefix: readonly string[]): string {
  const normalizedCurrentText = currentText.trim().length > 0 ? currentText : "{}";
  const parsed = JSON.parse(normalizedCurrentText) as Record<string, unknown>;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Claude settings must be a JSON object.");
  }

  const hooksValue = parsed.hooks;
  const hooks =
    hooksValue === undefined
      ? {}
      : hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)
        ? (hooksValue as Record<string, unknown>)
        : null;

  if (hooks === null) {
    throw new TypeError("Claude settings hooks must be a JSON object when present.");
  }

  const commandFor = (eventName: string): string =>
    shellJoin([...commandPrefix, "handle", "claude", "--event", eventName]);

  hooks.Notification = [
    {
      matcher: "permission_prompt|idle_prompt|elicitation_dialog",
      hooks: [
        {
          type: "command",
          command: commandFor("Notification")
        }
      ]
    }
  ];
  hooks.Stop = [
    {
      hooks: [
        {
          type: "command",
          command: commandFor("Stop")
        }
      ]
    }
  ];
  hooks.StopFailure = [
    {
      hooks: [
        {
          type: "command",
          command: commandFor("StopFailure")
        }
      ]
    }
  ];

  parsed.hooks = hooks;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}
