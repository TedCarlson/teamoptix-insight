#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const EXPECTED_REMOTES = new Set([
  "git@github.com:TedCarlson/teamoptix-insight.git",
  "https://github.com/TedCarlson/teamoptix-insight.git",
]);

function git(...args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

const root = git("rev-parse", "--show-toplevel");
const remote = git("config", "--get", "remote.origin.url");
const branch = git("branch", "--show-current") || "DETACHED";
const hooksPath = git("config", "--get", "core.hooksPath");
const status = git("status", "--porcelain");
const [behind, ahead] = git(
  "rev-list",
  "--left-right",
  "--count",
  "origin/main...HEAD"
)
  .split(/\s+/)
  .map(Number);

let failed = false;

console.log(`Repository: ${root}`);
console.log(`GitHub authority: ${remote}`);
console.log(`Branch: ${branch}`);
console.log(`Compared with origin/main: behind ${behind}, ahead ${ahead}`);
console.log(`Working tree: ${status ? "has local changes" : "clean"}`);
console.log(`Git hooks: ${hooksPath || "not configured"}`);

if (!EXPECTED_REMOTES.has(remote)) {
  console.error("Blocked: origin is not the canonical Team Optix Insight repository.");
  failed = true;
}
if (hooksPath !== ".githooks") {
  console.error("Blocked: run `pnpm setup:git-hooks` in this clone.");
  failed = true;
}
if (branch === "main" && behind > 0) {
  console.error("Blocked: local main is behind GitHub main. Fetch and fast-forward before working.");
  failed = true;
}

if (failed) process.exit(1);
console.log("Source authority check passed.");
