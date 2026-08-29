# Repository working-branch alignment

Before changing application code:

1. Refresh and inspect `origin/main` and compare it with the current working branch.
2. If the working branch is behind, align it to current `origin/main` before editing:
   - fast-forward when the branch can fast-forward cleanly;
   - otherwise rebase the feature branch onto `origin/main` so its work remains above the production baseline.
3. Preserve any dirty working-tree changes before alignment and restore them afterward. Never discard unrelated user work.
4. After the baseline changes, run the lockfile-pinned workspace dependency install before starting the local app or build.
5. Do not present a local acceptance gate from a branch that is behind `origin/main`.

At handoff, report the branch-to-`origin/main` alignment and verify that the working tree contains no unresolved merge state.
