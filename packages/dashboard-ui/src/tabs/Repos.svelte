<script lang="ts">
  import { api } from "../lib/api";
  type Repo = { id: string; name: string; root: string; health: string };
  let repos = $state<Repo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    api.listRepos()
      .then((res) => { repos = res.repos as Repo[]; loading = false; })
      .catch((e: Error) => { error = e.message; loading = false; });
  });

  function badgeColor(health: string): string {
    if (health === "passed") return "#22c55e";
    if (health === "failed") return "#ef4444";
    return "#94a3b8";
  }
</script>

<section class="tab">
  <h2>Repos</h2>
  {#if loading}
    <p class="muted">Loading…</p>
  {:else if error}
    <p class="error">Error: {error}</p>
  {:else}
    <div class="grid">
      {#each repos as repo}
        <article class="card">
          <header>
            <span class="badge" style:background={badgeColor(repo.health)}></span>
            <h3>{repo.name}</h3>
          </header>
          <p class="muted">{repo.root}</p>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .tab { padding: 1.5rem 2rem; }
  .muted { color: #64748b; font-size: 13px; }
  .error { color: #ef4444; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
  }
  .card {
    background: #1e293b;
    padding: 1rem;
    border-radius: 8px;
  }
  .card header { display: flex; align-items: center; gap: 0.5rem; }
  .card h3 { margin: 0; font-size: 14px; }
  .badge {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }
</style>
