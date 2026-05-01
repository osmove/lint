<script lang="ts">
  import { createMutation } from "@tanstack/svelte-query";
  import { api } from "../lib/api";

  // The two AI calls users hit most often. Both fall back to the git
  // staged set on the server when no body is provided — same UX as
  // `lint ai review` / `lint ai fix` on the CLI.
  type Mode = "review" | "fix";
  type AiResponse = Awaited<ReturnType<typeof api.aiReview>>;

  let mode = $state<Mode>("review");

  const runAi = createMutation<AiResponse, Error, void>({
    mutationFn: () =>
      mode === "review"
        ? api.aiReview({})
        : api.aiFix({}),
  });
</script>

<aside class="panel">
  <header>
    <h3>AI</h3>
    <div class="seg">
      <button class:active={mode === "review"} onclick={() => (mode = "review")}>Review</button>
      <button class:active={mode === "fix"} onclick={() => (mode = "fix")}>Fix</button>
    </div>
  </header>

  <button
    class="cta"
    disabled={$runAi.isPending}
    onclick={() => $runAi.mutate()}
  >
    {$runAi.isPending ? `Running ${mode}…` : `Run AI ${mode} on staged changes`}
  </button>

  {#if $runAi.isError}
    <p class="error">Error: {String($runAi.error)}</p>
    <p class="hint">Tip: set <code>ANTHROPIC_API_KEY</code> or run <code>lint ai setup</code>.</p>
  {:else if $runAi.data}
    <pre class="output">{$runAi.data.text}</pre>
  {:else}
    <p class="hint">Stage some changes (<code>git add</code>) then click above.</p>
  {/if}
</aside>

<style>
  .panel {
    background: #1e293b;
    border-radius: 10px;
    padding: 1rem 1.25rem;
    margin-top: 1.5rem;
  }
  header { display: flex; justify-content: space-between; align-items: center; }
  h3 { margin: 0; font-size: 14px; color: #e2e8f0; letter-spacing: 0.02em; }
  .seg {
    display: inline-flex;
    background: #0f172a;
    border-radius: 6px;
    padding: 2px;
  }
  .seg button {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 12px;
    padding: 0.25rem 0.625rem;
    border-radius: 4px;
  }
  .seg button.active { background: #334155; color: #f8fafc; }
  .cta {
    margin-top: 0.875rem;
    background: linear-gradient(135deg, #22d3ee, #0ea5e9 50%, #3b82f6);
    color: #0b1120;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-weight: 600;
    width: 100%;
  }
  .cta:disabled { opacity: 0.5; cursor: not-allowed; }
  .hint { color: #64748b; font-size: 12px; margin: 0.75rem 0 0; }
  .error { color: #ef4444; font-size: 12px; margin: 0.75rem 0 0.25rem; }
  code { background: #0f172a; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 11px; }
  .output {
    margin-top: 0.875rem;
    background: #0f172a;
    border-radius: 6px;
    padding: 0.875rem 1rem;
    font-size: 12px;
    line-height: 1.55;
    color: #cbd5e1;
    max-height: 320px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>
