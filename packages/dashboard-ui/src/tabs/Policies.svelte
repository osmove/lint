<script lang="ts">
  import { api } from "../lib/api";
  let yaml = $state("");
  let filePath = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    api.getPolicies()
      .then((res) => { yaml = res.yaml; filePath = res.filePath; loading = false; })
      .catch((e: Error) => { error = e.message; loading = false; });
  });
</script>

<section class="tab">
  <h2>Policies</h2>
  {#if loading}
    <p class="muted">Loading…</p>
  {:else if error}
    <p class="error">Error: {error}</p>
  {:else}
    <p class="muted">{filePath ?? "No .lintrc.yaml found — using defaults."}</p>
    <pre>{yaml || "# (empty config)"}</pre>
  {/if}
</section>

<style>
  .tab { padding: 1.5rem 2rem; }
  .muted { color: #64748b; }
  .error { color: #ef4444; }
  pre {
    background: #1e293b;
    padding: 1rem;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.5;
  }
</style>
