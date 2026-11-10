# Plan

## Goal and scope
A1 Sivakasi Crackers order dashboard (Vite + React + Supabase). Staff manage savings-scheme customers across Nov–Oct cycles.

Current task: let staff move a past-cycle customer into the active cycle.

**Out of scope:** auto-rejoin, changing past-cycle data, fixing the pre-existing `current_month` format mismatch (see MEMORY.md open questions).

## Project memory
- Cycle membership = `orders.created_at` range (Nov 1 → Nov 1). Archived cycles are read-only in the UI.
- Monthly rows are created by DB trigger, not the client.

## Features (prioritized)
1. [Rejoin Next Cycle](features/rejoin-next-cycle.md): "Add to Current Cycle" per row, plus checkbox select / select-all bulk add on archived cycles.

## Build order
1. Rejoin Next Cycle (no dependencies).
