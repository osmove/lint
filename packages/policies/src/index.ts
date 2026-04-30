// auth.ts re-exports `login` and `signup` from api.ts wrapping them with
// credential persistence — those are the user-facing forms. Re-export auth
// last and shadow the lower-level api versions to avoid ambiguity.
export {
  fetchUser,
  fetchRepository,
  searchRepository,
  createRepository,
  fetchPolicy,
  createCommitAttempt,
  postReport,
} from "./api.js";
export * from "./auth.js";
