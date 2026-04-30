<script lang="ts">
  import { QueryClientProvider } from "@tanstack/svelte-query";
  import { queryClient } from "./lib/query";
  import Runs from "./tabs/Runs.svelte";
  import Policies from "./tabs/Policies.svelte";
  import Repos from "./tabs/Repos.svelte";

  type Tab = "runs" | "policies" | "repos";
  let active = $state<Tab>("runs");
</script>

<QueryClientProvider client={queryClient}>
  <header class="topbar">
    <div class="brand">
      <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
        <rect width="32" height="32" rx="7" ry="7" fill="#0f172a"/>
        <path d="M 9 8 H 23 A 1.5 1.5 0 0 1 24.5 9.5 V 17 C 24.5 22 21 25.5 16 27 C 11 25.5 7.5 22 7.5 17 V 9.5 A 1.5 1.5 0 0 1 9 8 Z" fill="#e2e8f0"/>
        <polyline points="11,16.5 14.5,20 21,12" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>Lint</span>
    </div>
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
</QueryClientProvider>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 2rem;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #0b1120, #1e293b);
    border-bottom: 1px solid #334155;
  }
  .brand { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; letter-spacing: 0.02em; }
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
