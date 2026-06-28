# ADR-001: Repo Shape

## Status
Accepted

## Context
Insight is being started as a clean foundation intended to support growth across industries under the TeamOptix brand.

## Decision
Use a monorepo structure with:
- apps/web
- packages/ui
- packages/config
- packages/types
- docs
- scripts

## Why
This keeps the first app simple while leaving room for shared packages, stronger standards, and future expansion without early structural rework.

