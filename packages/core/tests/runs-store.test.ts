import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRunsStore, type Run } from "../src/runs-store.js";

describe("createRunsStore", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-runs-store-"));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeRun(overrides: Partial<Run> = {}): Run {
    return {
      id: "run-1",
      startedAt: new Date(2026, 0, 1).toISOString(),
      errorCount: 0,
      warningCount: 0,
      status: "running",
      ...overrides,
    };
  }

  it("returns empty list when no .lint/runs.jsonl exists", () => {
    const store = createRunsStore(tmpDir);
    expect(store.list()).toEqual([]);
    expect(store.get("anything")).toBeNull();
  });

  it("inserts and retrieves a run", () => {
    const store = createRunsStore(tmpDir);
    const run = makeRun();
    store.insert(run);
    expect(store.get("run-1")).toEqual(run);
    expect(store.list()).toHaveLength(1);
  });

  it("update appends a new line, last-write-wins on read", () => {
    const store = createRunsStore(tmpDir);
    store.insert(makeRun({ status: "running" }));
    const updated = store.update("run-1", { status: "passed", errorCount: 0 });
    expect(updated?.status).toBe("passed");
    expect(store.get("run-1")?.status).toBe("passed");

    const file = fs.readFileSync(path.join(tmpDir, ".lint/runs.jsonl"), "utf-8");
    expect(file.split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("update on unknown id returns null and does not write", () => {
    const store = createRunsStore(tmpDir);
    expect(store.update("does-not-exist", { status: "passed" })).toBeNull();
  });

  it("list is sorted by startedAt desc (newest first)", () => {
    const store = createRunsStore(tmpDir);
    store.insert(makeRun({ id: "old", startedAt: "2026-01-01T00:00:00.000Z" }));
    store.insert(makeRun({ id: "new", startedAt: "2026-02-01T00:00:00.000Z" }));
    expect(store.list().map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("survives malformed lines (best-effort parse)", () => {
    const file = path.join(tmpDir, ".lint/runs.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      `{"id":"good","startedAt":"2026-01-01T00:00:00.000Z","errorCount":0,"warningCount":0,"status":"passed"}\nNOT JSON\n`,
      "utf-8",
    );
    const store = createRunsStore(tmpDir);
    expect(store.list().map((r) => r.id)).toEqual(["good"]);
  });
});
