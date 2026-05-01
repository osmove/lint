<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { api } from "../lib/api";

  type Repo = {
    id: string;
    name: string;
    root: string;
    projectId: string;
    projectName: string;
    addedAt: string | null;
    ephemeral: boolean;
    health: "passed" | "failed" | "unknown";
    latestRun: { id: string; status: string; finishedAt?: string; errorCount: number; warningCount: number } | null;
    summary: { total: number; passed: number; failed: number; running: number };
  };

  const qc = useQueryClient();

  type ReposResponse = Awaited<ReturnType<typeof api.listRepos>>;
  type CreateRepoResponse = Awaited<ReturnType<typeof api.createRepo>>;
  type RemoveRepoResponse = Awaited<ReturnType<typeof api.removeProjectRepo>>;

  const reposQuery = createQuery<ReposResponse>({
    queryKey: ["repos"],
    queryFn: () => api.listRepos(),
    refetchInterval: 5_000, // health changes whenever a run completes
  });

  const registerCurrent = createMutation<CreateRepoResponse, Error, Repo>({
    mutationFn: (repo: Repo) => api.createRepo({ path: repo.root, name: repo.name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["repos"] });
    },
  });

  const removeRepo = createMutation<RemoveRepoResponse, Error, { projectId: string; repoId: string }>({
    mutationFn: ({ projectId, repoId }) => api.removeProjectRepo(projectId, repoId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["repos"] });
    },
  });

  function badgeColor(health: string): string {
    if (health === "passed") return "#22c55e";
    if (health === "failed") return "#ef4444";
    return "#94a3b8";
  }

  function badgeLabel(health: string): string {
    if (health === "passed") return "passing";
    if (health === "failed") return "failing";
    return "no runs yet";
  }

  function projectGroups(repos: Repo[]): Array<{ id: string; name: string; repos: Repo[] }> {
    const groups = new Map<string, { id: string; name: string; repos: Repo[] }>();
    for (const repo of repos) {
      const id = repo.projectId || repo.id;
      const name = repo.projectName || repo.name;
      const group = groups.get(id) ?? { id, name, repos: [] };
      group.repos.push(repo);
      groups.set(id, group);
    }
    return [...groups.values()];
  }
</script>

<section class="tab">
  <h2>Projects</h2>
  {#if $reposQuery.isPending}
    <p class="muted">Loading…</p>
  {:else if $reposQuery.isError}
    <p class="error">Error: {String($reposQuery.error)}</p>
  {:else}
    <div class="projects">
      {#each projectGroups(($reposQuery.data?.repos ?? []) as Repo[]) as project (project.id)}
        <section class="project">
          <header class="project-head">
            <h3>{project.name}</h3>
            <span class="muted">{project.repos.length} repo{project.repos.length > 1 ? "s" : ""}</span>
          </header>
          <div class="grid">
            {#each project.repos as repo (repo.id)}
              {@const r = repo as Repo}
              <article class="card" class:ephemeral={r.ephemeral}>
                <header>
                  <span class="badge" style:background={badgeColor(r.health)}></span>
                  <h4>{r.name}</h4>
                  {#if r.ephemeral}
                    <span class="tag">unregistered</span>
                  {/if}
                </header>
                <p class="root">{r.root}</p>

                <div class="health">
                  <span class="status" data-status={r.health}>{badgeLabel(r.health)}</span>
                  {#if r.latestRun}
                    <span class="muted">{r.latestRun.errorCount}E / {r.latestRun.warningCount}W</span>
                  {/if}
                </div>

                {#if r.summary.total > 0}
                  <div class="bar" aria-label="passed/failed split" title={`${r.summary.passed} passed · ${r.summary.failed} failed · ${r.summary.running} running`}>
                    <span class="seg pass" style:flex={r.summary.passed}></span>
                    <span class="seg fail" style:flex={r.summary.failed}></span>
                    <span class="seg run" style:flex={r.summary.running}></span>
                  </div>
                  <div class="counts muted">
                    {r.summary.total} run{r.summary.total > 1 ? "s" : ""} · {r.summary.passed} passed · {r.summary.failed} failed
                  </div>
                {/if}

                <footer>
                  {#if r.ephemeral}
                    <button
                      class="cta-small"
                      disabled={$registerCurrent.isPending}
                      onclick={() => $registerCurrent.mutate(r)}
                    >
                      Register repo
                    </button>
                  {:else}
                    <button
                      class="link"
                      disabled={$removeRepo.isPending}
                      onclick={() => $removeRepo.mutate({ projectId: r.projectId, repoId: r.id })}
                    >
                      remove
                    </button>
                  {/if}
                </footer>
              </article>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</section>

<style>
  .tab { padding: 1.5rem 2rem; }
  .muted { color: #64748b; font-size: 13px; }
  .error { color: #ef4444; }
  .projects { display: flex; flex-direction: column; gap: 1.25rem; margin-top: 1rem; }
  .project { display: flex; flex-direction: column; gap: 0.75rem; }
  .project-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  .project-head h3 { margin: 0; font-size: 15px; color: #e2e8f0; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }
  .card {
    background: #1e293b;
    padding: 1rem 1.125rem;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .card.ephemeral { border: 1px dashed #475569; }
  .card header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .card h4 { margin: 0; font-size: 14px; color: #e2e8f0; flex: 1; }
  .tag {
    background: #334155;
    color: #cbd5e1;
    font-size: 10px;
    padding: 0.0625rem 0.375rem;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .root {
    color: #94a3b8;
    font-size: 12px;
    font-family: ui-monospace, "Geist Mono", monospace;
    margin: 0;
    word-break: break-all;
  }
  .badge { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .health { display: flex; align-items: center; gap: 0.5rem; }
  .status {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
  }
  .status[data-status="passed"] { color: #22c55e; }
  .status[data-status="failed"] { color: #ef4444; }
  .bar {
    display: flex;
    height: 4px;
    background: #0f172a;
    border-radius: 2px;
    overflow: hidden;
  }
  .seg.pass { background: #22c55e; }
  .seg.fail { background: #ef4444; }
  .seg.run { background: #94a3b8; }
  .counts { font-size: 11px; }
  footer { margin-top: auto; display: flex; justify-content: flex-end; }
  .cta-small {
    background: linear-gradient(135deg, #22d3ee, #0ea5e9 50%, #3b82f6);
    color: #0b1120;
    border: none;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 12px;
  }
  .cta-small:disabled { opacity: 0.5; cursor: not-allowed; }
  .link {
    background: none;
    border: none;
    color: #64748b;
    cursor: pointer;
    font-size: 11px;
    padding: 0;
  }
  .link:hover { color: #ef4444; }
</style>
