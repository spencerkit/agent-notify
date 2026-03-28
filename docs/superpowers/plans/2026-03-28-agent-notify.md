# Agent Notify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python CLI that receives Codex and Claude lifecycle payloads, normalizes them into a shared event model, dedupes and logs them, and emits desktop and sound notifications while providing install commands for both tools.

**Architecture:** Keep the project dependency-light and file-focused. Event adapters normalize source-specific payloads into one internal dataclass, a notifier pipeline applies config and dedupe, providers emit notifications, and installers patch external config files without requiring a resident daemon.

**Tech Stack:** Python 3.13, `argparse`, `dataclasses`, `json`, `tomllib`, `pathlib`, `pytest`

---

### Task 1: Project Skeleton

**Files:**
- Create: `pyproject.toml`
- Create: `README.md`
- Create: `src/agent_notify/__init__.py`
- Create: `src/agent_notify/cli.py`
- Test: `tests/conftest.py`

- [ ] **Step 1: Write the failing test**

```python
def test_cli_module_imports():
    import agent_notify.cli
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=src pytest tests/test_smoke.py::test_cli_module_imports -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

```python
# src/agent_notify/cli.py
def main() -> int:
    return 0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=src pytest tests/test_smoke.py::test_cli_module_imports -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml README.md src/agent_notify/__init__.py src/agent_notify/cli.py tests/conftest.py tests/test_smoke.py
git commit -m "feat: scaffold agent-notify cli"
```

### Task 2: Event Normalization

**Files:**
- Create: `src/agent_notify/events.py`
- Test: `tests/test_events.py`

- [ ] **Step 1: Write the failing test**

```python
def test_codex_notify_payload_maps_to_completed():
    payload = {
        "type": "agent-turn-complete",
        "thread-id": "thread-1",
        "turn-id": "turn-1",
        "cwd": "/tmp/demo",
        "input-messages": ["rename foo"],
        "last-assistant-message": "rename complete",
    }
    event = parse_event("codex", payload)
    assert event.state == "completed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=src pytest tests/test_events.py::test_codex_notify_payload_maps_to_completed -v`
Expected: FAIL with `NameError` or import failure

- [ ] **Step 3: Write minimal implementation**

```python
def parse_event(source, payload):
    ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=src pytest tests/test_events.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent_notify/events.py tests/test_events.py
git commit -m "feat: normalize codex and claude events"
```

### Task 3: Dedupe And Event Logging

**Files:**
- Create: `src/agent_notify/store.py`
- Test: `tests/test_store.py`

- [ ] **Step 1: Write the failing test**

```python
def test_duplicate_event_within_ttl_is_suppressed(tmp_path):
    store = EventStore(tmp_path, dedupe_seconds=15)
    assert store.should_emit(event)
    store.record(event)
    assert not store.should_emit(event)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=src pytest tests/test_store.py::test_duplicate_event_within_ttl_is_suppressed -v`
Expected: FAIL because `EventStore` does not exist

- [ ] **Step 3: Write minimal implementation**

```python
class EventStore:
    ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=src pytest tests/test_store.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent_notify/store.py tests/test_store.py
git commit -m "feat: add event dedupe and logging"
```

### Task 4: Providers And Notify Pipeline

**Files:**
- Create: `src/agent_notify/config.py`
- Create: `src/agent_notify/providers.py`
- Create: `src/agent_notify/notifier.py`
- Test: `tests/test_notifier.py`

- [ ] **Step 1: Write the failing test**

```python
def test_completed_event_uses_desktop_provider(mocker):
    ...
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=src pytest tests/test_notifier.py -v`
Expected: FAIL because notifier objects do not exist

- [ ] **Step 3: Write minimal implementation**

```python
class Notifier:
    ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=src pytest tests/test_notifier.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent_notify/config.py src/agent_notify/providers.py src/agent_notify/notifier.py tests/test_notifier.py
git commit -m "feat: deliver desktop and sound notifications"
```

### Task 5: Installers

**Files:**
- Create: `src/agent_notify/installers.py`
- Modify: `src/agent_notify/cli.py`
- Test: `tests/test_installers.py`

- [ ] **Step 1: Write the failing test**

```python
def test_install_codex_sets_notify_array(tmp_path):
    ...
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=src pytest tests/test_installers.py -v`
Expected: FAIL because installer helpers do not exist

- [ ] **Step 3: Write minimal implementation**

```python
def install_codex(...):
    ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=src pytest tests/test_installers.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent_notify/installers.py src/agent_notify/cli.py tests/test_installers.py
git commit -m "feat: add codex and claude installers"
```

### Task 6: End-To-End CLI Routing

**Files:**
- Modify: `src/agent_notify/cli.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

```python
def test_cli_reads_codex_payload_from_argument_and_emits(tmp_path):
    ...
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=src pytest tests/test_cli.py -v`
Expected: FAIL because command routing is incomplete

- [ ] **Step 3: Write minimal implementation**

```python
def build_parser():
    ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=src pytest tests/test_cli.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent_notify/cli.py tests/test_cli.py
git commit -m "feat: wire cli commands end to end"
```

### Task 7: Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the full test suite**

Run: `PYTHONPATH=src pytest -v`
Expected: all tests pass

- [ ] **Step 2: Run smoke install previews**

Run: `PYTHONPATH=src python3 -m agent_notify.cli install codex --dry-run`
Expected: prints patched Codex config

Run: `PYTHONPATH=src python3 -m agent_notify.cli install claude --dry-run`
Expected: prints patched Claude settings JSON

- [ ] **Step 3: Update usage docs**

```markdown
## Usage

- `agent-notify install codex`
- `agent-notify install claude`
- `agent-notify handle codex '<json>'`
- `agent-notify handle claude --event Stop < payload.json`
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add agent-notify usage"
```
