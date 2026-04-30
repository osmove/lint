import { QueryClient } from "@tanstack/svelte-query";

// Tuning: short staleTime so the user sees fresh runs immediately after
// triggering one, but long enough that flipping between tabs doesn't
// re-hit the server every click.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
