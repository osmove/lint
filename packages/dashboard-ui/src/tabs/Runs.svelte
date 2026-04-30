<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { api } from "../lib/api";
  import AiPanel from "./AiPanel.svelte";

  const qc = useQueryClient();

  const runsQuery = createQuery(() => ({
    queryKey: ["runs"],
    queryFn: () => api.listRuns(),
  }));

  const triggerRun = createMutation(() => ({
    mutationFn: () => api.createRun({ paths: ["."] }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  }));

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

  {#if $runsQuery.isPending}
    <p class="muted">Loading…</p>
  {:else if $runsQuery.isError}
    <p class="error">Error: {String($runsQuery.error)}</p>
  {:else if $runsQuery.data?.runs?.length === 0}
    <p class="muted">No runs yet. Click <code>Run lint</code> or trigger one with <code>lint .</code>.</p>
  {:else}
    <ul class="runs">
      {#each $runsQuery.data?.runs ?? [] as run}
        <li>
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
  code { background: #1e293b; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 12px; }
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
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .id { font-family: ui-monospace, monospace; color: #cbd5e1; }
  .counts { font-family: ui-monospace, monospace; color: #94a3b8; font-size: 12px; }
  .status { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
  .status[data-status="passed"] { color: #22c55e; }
  .status[data-status="failed"] { color: #ef4444; }
</style>
