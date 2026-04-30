<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { api } from "../lib/api";
  import { subscribeRunStream } from "../lib/run-stream";
  import AiPanel from "./AiPanel.svelte";

  const qc = useQueryClient();

  const runsQuery = createQuery(() => ({
    queryKey: ["runs"],
    queryFn: () => api.listRuns(),
    refetchInterval: 2_000, // poll while runs are visible — cheap, ~1KB/req
  }));

  const triggerRun = createMutation(() => ({
    mutationFn: () => api.createRun({ paths: ["."] }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["runs"] });
      // Auto-attach the live stream panel to the run we just kicked off.
      streamRunId = created.id;
      streamLines = [];
    },
  }));

  // Live stream state for one selected run id.
  let streamRunId = $state<string | null>(null);
  let streamLines = $state<string[]>([]);

  $effect(() => {
    if (!streamRunId) return;
    const id = streamRunId;
    const unsub = subscribeRunStream(id, (ev) => {
      if (ev.type === "stdout" || ev.type === "stderr") {
        streamLines = [...streamLines.slice(-500), ev.data];
      } else if (ev.type === "exit") {
        streamLines = [...streamLines, `\n--- exited ${ev.status} (code ${ev.code}) ---`];
        qc.invalidateQueries({ queryKey: ["runs"] });
      }
    });
    return () => unsub();
  });

  function badge(status: string): string {
    if (status === "passed") return "#22c55e";
    if (status === "failed") return "#ef4444";
    return "#94a3b8";
  }
</script>

<section class="tab">
  <header class="tab-header">
    <h2>Runs</h2>
    <button
      class="cta"
      disabled={$triggerRun.isPending}
      onclick={() => $triggerRun.mutate()}
    >
      {$triggerRun.isPending ? "Triggering…" : "Run lint"}
    </button>
  </header>

  {#if streamRunId}
    <div class="stream">
      <header>
        <span class="muted">Live: {streamRunId}</span>
        <button class="link" onclick={() => { streamRunId = null; streamLines = []; }}>close</button>
      </header>
      <pre>{streamLines.join("")}</pre>
    </div>
  {/if}

  {#if $runsQuery.isPending}
    <p class="muted">Loading…</p>
  {:else if $runsQuery.isError}
    <p class="error">Error: {String($runsQuery.error)}</p>
  {:else if $runsQuery.data?.runs?.length === 0}
    <p class="muted">No runs yet. Click <code>Run lint</code> or trigger one with <code>lint .</code>.</p>
  {:else}
    <ul class="runs">
      {#each $runsQuery.data?.runs ?? [] as run}
        <li
          class:selectable={true}
          class:active={run.id === streamRunId}
          onclick={() => { streamRunId = run.id; streamLines = []; }}
          onkeydown={(e) => { if (e.key === "Enter") { streamRunId = run.id; streamLines = []; } }}
          role="button"
          tabindex="0"
        >
          <span class="dot" style:background={badge(run.status)}></span>
          <span class="id">{run.id}</span>
          <span class="muted">{new Date(run.startedAt).toLocaleString()}</span>
          <span class="counts">{run.errorCount}E / {run.warningCount}W</span>
          <span class="status" data-status={run.status}>{run.status}</span>
        </li>
      {/each}
    </ul>
  {/if}

  <AiPanel />
</section>

<style>
  .tab { padding: 1.5rem 2rem; }
  .tab-header { display: flex; align-items: center; justify-content: space-between; }
  .muted { color: #64748b; }
  .error { color: #ef4444; }
  .cta {
    background: linear-gradient(135deg, #22d3ee, #0ea5e9 50%, #3b82f6);
    color: #0b1120;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-weight: 600;
  }
  .cta:disabled { opacity: 0.5; cursor: not-allowed; }
  .link {
    background: none;
    border: none;
    color: #38bdf8;
    cursor: pointer;
    font-size: 12px;
    padding: 0;
  }
  .link:hover { text-decoration: underline; }
  code { background: #1e293b; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 12px; }

  .stream {
    margin-top: 1rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 0.75rem 0.875rem;
  }
  .stream header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .stream pre {
    margin: 0;
    font-family: ui-monospace, "Geist Mono", monospace;
    font-size: 11px;
    line-height: 1.5;
    color: #94a3b8;
    max-height: 240px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .runs { list-style: none; padding: 0; margin: 1rem 0 0; }
  .runs li {
    display: grid;
    grid-template-columns: 16px 1fr auto auto auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.875rem;
    background: #1e293b;
    border-radius: 8px;
    margin-bottom: 0.375rem;
    font-size: 13px;
  }
  .runs li.selectable { cursor: pointer; transition: background 120ms; }
  .runs li.selectable:hover { background: #334155; }
  .runs li.active { outline: 2px solid #0ea5e9; outline-offset: -2px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .id { font-family: ui-monospace, monospace; color: #cbd5e1; }
  .counts { font-family: ui-monospace, monospace; color: #94a3b8; font-size: 12px; }
  .status { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
  .status[data-status="passed"] { color: #22c55e; }
  .status[data-status="failed"] { color: #ef4444; }
</style>
