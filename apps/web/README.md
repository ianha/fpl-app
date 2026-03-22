# @fpl/web — React Frontend

A dark-themed, premium React application for FPL analytics, styled using Tailwind CSS v4, shadcn/ui, framer-motion, and Recharts.

## Pages & Routes

- `/` (**Dashboard**): Animated hero, top players, next fixtures.
- `/players` (**Browser**): Searchable, filterable player list.
- `/players/:id` (**Player Detail**): Points history (Area chart), attributes (Radar chart).
- `/fixtures` (**Fixtures**): Gameweek navigable matches.
- `/teams/:id` (**Team Detail**): Squad by position, upcoming matches.

## Commands

Run from repo root or with `-w @fpl/web`.

| Command | Description |
|---|---|
| `npm run dev:web` | Start the Vite server at `http://localhost:5173` |
| `npm run build` | Type-check and build to `dist/` |
| `npm run test` | Run component tests via Vitest & React Testing Library |

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
