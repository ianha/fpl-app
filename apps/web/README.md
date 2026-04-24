# @fpl/web — React Frontend

A dark-themed, premium React application for FPL analytics, styled using Tailwind CSS v4, shadcn/ui, framer-motion, and Recharts.

## Pages & Routes

- `/` (**Dashboard**): Animated hero, top players, next fixtures.
- `/players` (**Browser**): Searchable, filterable player list.
- `/players/:id` (**Player Detail**): Points history (Area chart), attributes (Radar chart).
- `/fixtures` (**Fixtures**): Gameweek navigable matches.
- `/fixtures/fdr` (**Fixture Difficulty**): FDR-focused fixture planner.
- `/teams/:id` (**Team Detail**): Squad by position, upcoming matches.
- `/my-team` (**My Team**): Linked manager dashboard, picks, transfers, live GW data, and share recaps.
- `/leagues` and `/leagues/:leagueId/h2h/:rivalEntryId` (**Leagues/H2H**): Mini-league hub and rival comparison, including AI chat handoff.
- `/chat` (**AI Chat**): Provider-backed natural-language analysis using the API's internal read-only tools.

## Commands

Run from repo root or with `-w @fpl/web`.

| Command | Description |
|---|---|
| `npm run dev:web` | Start the Vite server at `http://localhost:5173` |
| `npm run build -w @fpl/web` | Type-check and build to `dist/` |
| `npm run typecheck -w @fpl/web` | Type-check without emitting build output |
| `npm run typecheck:unused -w @fpl/web` | Type-check with unused locals/parameters enabled |
| `npm run test -w @fpl/web` | Run component tests via Vitest & React Testing Library |

## Architecture

- **State Management**: Localized state via an `AsyncState<T>` (loading/ready/error) discriminated union. No generic global store is used.
- **Data Fetching**: `src/api/client.ts` exports strongly-typed fetch wrappers for endpoints defined in `@fpl/contracts`.
- **Styling**: `src/styles/global.css` controls the FPL brand palette (`#e90052` primary, `#00ffbf` accent, `#37003c` background) using Tailwind v4 CSS variables.
- **Custom Components**: Includes `GlowCard`, a shared card primitive with pointer-tracking border highlights (`src/components/ui/glow-card.tsx`).
- **Responsive Navigation**: Desktop features left-sided sticky layout; mobile employs a collapsible `Sheet` drawer hamburger menu.

## Environment Variables

| Variable | Default | Use |
|---|---|---|
| `VITE_API_BASE_URL` | Unset (falls back to `origin + "/api"`) | Override backend endpoint URL |
