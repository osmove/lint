<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { api } from "../lib/api";

  type Repo = { id: string; name: string; root: string; health: string };

  const reposQuery = createQuery(() => ({
    queryKey: ["repos"],
    queryFn: () => api.listRepos(),
  }));

  function badgeColor(health: string): string {
    if (health === "passed") return "#22c55e";
    if (health === "failed") return "#ef4444";
    return "#94a3b8";
  }
</script>

<section class="tab">
  <h2>Repos</h2>
  {#if $reposQuery.isPending}
    <p class="muted">Loading…</p>
  {:else if $reposQuery.isError}
    <p class="error">Error: {String($reposQuery.error)}</p>
  {:else}
    <div class="grid">
      {#each ($reposQuery.data?.repos ?? []) as repo (repo.id)}
        <article class="card">
          <header>
            <span class="badge" style:background={badgeColor((repo as Repo).health)}></span>
            <h3>{(repo as Repo).name}</h3>
          </header>
          <p class="muted">{(repo as Repo).root}</p>
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
  .card { background: #1e293b; padding: 1rem; border-radius: 8px; }
  .card header { display: flex; align-items: center; gap: 0.5rem; }
  .card h3 { margin: 0; font-size: 14px; color: #e2e8f0; }
  .badge { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
</style>
