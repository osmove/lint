<script lang="ts">
  import Runs from "./tabs/Runs.svelte";
  import Policies from "./tabs/Policies.svelte";
  import Repos from "./tabs/Repos.svelte";

  type Tab = "runs" | "policies" | "repos";
  let active = $state<Tab>("runs");
</script>

<header class="topbar">
  <div class="brand">Lint</div>
  <nav>
    <button class:active={active === "runs"} onclick={() => (active = "runs")}>Runs</button>
    <button class:active={active === "policies"} onclick={() => (active = "policies")}>Policies</button>
    <button class:active={active === "repos"} onclick={() => (active = "repos")}>Repos</button>
  </nav>
</header>

<main>
  {#if active === "runs"}<Runs />{/if}
  {#if active === "policies"}<Policies />{/if}
  {#if active === "repos"}<Repos />{/if}
</main>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 2rem;
    padding: 0.75rem 1.5rem;
    background: #1e293b;
    border-bottom: 1px solid #334155;
  }
  .brand { font-weight: 700; letter-spacing: 0.05em; }
  nav { display: flex; gap: 0.25rem; }
  nav button {
    padding: 0.375rem 0.875rem;
    background: transparent;
    border: none;
    color: #94a3b8;
    border-radius: 6px;
  }
  nav button:hover { color: #e2e8f0; background: #334155; }
  nav button.active { color: #f8fafc; background: #0f172a; }
  main { min-height: calc(100vh - 60px); }
</style>
