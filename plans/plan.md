# System Plan Index

This folder now uses a split documentation model so an engineer or another AI agent can implement the full system with clear separation of concerns.

## Primary Documents

- `plans/architecture.md` - system architecture, data model, route topology, security boundaries, and deployment/runtime model
- `plans/spec.md` - complete functional specification: auth, billing, credits, admin, notifications, i18n, workflows, and acceptance criteria
- `plans/ui-spec.md` - look and feel specification: visual language, component behavior, page composition, chart/table/dialog UX, and responsive rules

## How To Use

1. Read `plans/architecture.md` first.
2. Implement against `plans/spec.md` behavior requirements.
3. Apply `plans/ui-spec.md` for UI parity and consistency.

## Scope Note

This index intentionally replaces older narrow implementation notes. The three documents above are the canonical implementation source.

## Memory Bank Note

`frontend/.kilocode/rules/memory-bank-instructions.md` remains useful for AI workflow continuity and should complement these plans.
