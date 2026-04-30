<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { api } from "../lib/api";

  const policiesQuery = createQuery(() => ({
    queryKey: ["policies"],
    queryFn: () => api.getPolicies(),
  }));
</script>

<section class="tab">
  <h2>Policies</h2>
  {#if $policiesQuery.isPending}
    <p class="muted">Loading…</p>
  {:else if $policiesQuery.isError}
    <p class="error">Error: {String($policiesQuery.error)}</p>
  {:else}
    <p class="muted">{$policiesQuery.data?.filePath ?? "No .lintrc.yaml found — using defaults."}</p>
    <pre>{$policiesQuery.data?.yaml || "# (empty config)"}</pre>
  {/if}
</section>

<style>
  .tab { padding: 1.5rem 2rem; }
  .muted { color: #64748b; font-size: 13px; }
  .error { color: #ef4444; }
  pre {
    background: #1e293b;
    padding: 1rem;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.5;
    color: #cbd5e1;
  }
</style>
