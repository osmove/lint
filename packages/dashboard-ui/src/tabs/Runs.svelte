<script lang="ts">
  import { api } from "../lib/api";
  let runs = $state<unknown[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    api.listRuns()
      .then((res) => { runs = res.runs; loading = false; })
      .catch((e: Error) => { error = e.message; loading = false; });
  });
</script>

<section class="tab">
  <h2>Runs</h2>
  {#if loading}
    <p class="muted">Loading…</p>
  {:else if error}
    <p class="error">Error: {error}</p>
  {:else if runs.length === 0}
    <p class="muted">No runs yet. Trigger one with <code>lint .</code> or via the API.</p>
  {:else}
    <ul>
      {#each runs as run}
        <li>{JSON.stringify(run)}</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .tab { padding: 1.5rem 2rem; }
  .muted { color: #64748b; }
  .error { color: #ef4444; }
  code { background: #1e293b; padding: 0.125rem 0.375rem; border-radius: 4px; }
</style>
