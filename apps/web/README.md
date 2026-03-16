# @fpl/web — React Frontend

A dark-themed, premium React frontend for the FPL analytics app. Built with Tailwind CSS v4, shadcn/ui, React Router, framer-motion, and Recharts.

---

## What it shows

The app has five pages, each accessible via the persistent sidebar navigation:

| Route | Page | What it displays |
|---|---|---|
| `/` | **Dashboard** | Animated hero banner, top 8 players, fixture list, season stats |
| `/players` | **Player Browser** | Searchable, filterable, sortable list of all players |
| `/players/:id` | **Player Detail** | Full season stats, points history area chart, attribute radar chart, upcoming fixtures |
| `/fixtures` | **Fixtures** | All fixtures grouped by gameweek with a gameweek navigator and team filter |
| `/teams/:id` | **Team Detail** | Team overview, squad grouped by position, upcoming fixtures |

### Design language

- **Dark glassmorphism theme**: deep purple background (`hsl(267 97% 5%)`), frosted-glass cards with backdrop blur
- **FPL brand palette**: magenta primary (`#e90052`), teal accent (`#00ffbf`), deep purple (`#37003c`)
- **Typography**: Syne for headings, Inter for body text (both served by Google Fonts)
- **Motion**: framer-motion stagger animations on lists, pointer-tracking glow on cards, animated gradient hero background
- **GlowCard**: a shared card component that tracks the mouse pointer and applies a radial glow to the card border — visible on hover

---

## Commands

Run these from the repository root, or with `-w @fpl/web` from elsewhere.

| Command | Description |
|---|---|
| `npm run dev:web` | Start the Vite dev server at `http://localhost:5173` with HMR |
| `npm run build` | Type-check (`tsc --noEmit`) then bundle to `dist/` |
| `npm run test` | Run all frontend tests once |

The frontend requires the API to be running simultaneously. Start both with `npm run dev` from the repo root.

---

## Architecture

| Technology | Purpose |
|---|---|
| React 19 | UI rendering and component state |
| React Router v7 | Client-side routing across five pages |
| Vite 7 | Dev server, HMR, production bundler |
| Tailwind CSS v4 | Utility-first styling via `@tailwindcss/vite` plugin |
| shadcn/ui (new-york) | Accessible base components (Button, Input, Select, Sheet, Badge, Card) |
| framer-motion | Animations: page entrance, stagger, hover, animated gradients |
| Recharts | Area charts (points history) and radar charts (player attributes) |
| `@fpl/contracts` | Shared TypeScript types across API and frontend |

### Route structure

```tsx
// src/App.tsx
<Routes>
  <Route path="/"           element={<Dashboard />} />
  <Route path="/players"    element={<PlayersPage />} />
  <Route path="/players/:id" element={<PlayerDetailPage />} />
  <Route path="/fixtures"   element={<FixturesPage />} />
  <Route path="/teams/:id"  element={<TeamDetailPage />} />
</Routes>
```

`BrowserRouter` wraps the app in `src/main.tsx`. The shared `Sidebar` component lives outside the route tree and renders on every page.

---

## State management

Each page manages its own async state using a `AsyncState<T>` discriminated union pattern:

```ts
type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };
```

This pattern guarantees TypeScript will narrow the type correctly — you cannot access `.data` unless `status === "ready"`. There is no global state store; all state is co-located with the component that needs it.

---

## Source files

| File | Description |
|---|---|
| `src/main.tsx` | React DOM root — mounts `<App />` into `#root`, wraps in `<BrowserRouter>` |
| `src/App.tsx` | Root layout — renders `<Sidebar>` + `<Routes>` |
| `src/styles/global.css` | Tailwind v4 `@import`, `@theme` block (CSS variables), FPL dark palette |
| `src/api/client.ts` | Typed fetch wrappers: `getOverview`, `getPlayers`, `getPlayer`, `getFixtures`, `resolveAssetUrl` |
| `src/lib/utils.ts` | `cn()` — clsx + tailwind-merge utility for conditional class names |
| `src/lib/format.ts` | `formatCost(cost)` and `formatPercent(value)` display helpers |
| `src/pages/Dashboard.tsx` | Home page with animated hero and bento grid |
| `src/pages/PlayersPage.tsx` | Player browser with search, position filter, and sort |
| `src/pages/PlayerDetailPage.tsx` | Per-player stats, charts, and fixture list |
| `src/pages/FixturesPage.tsx` | Gameweek-navigable fixture browser with team filter |
| `src/pages/TeamDetailPage.tsx` | Team overview, squad by position, upcoming fixtures |
| `src/components/layout/Sidebar.tsx` | Sticky left sidebar (desktop) + Sheet drawer (mobile) |
| `src/components/ui/glow-card.tsx` | `GlowCard` (pointer-tracking border glow) and `BGPattern` (grid/dot overlay) |
| `src/components/ui/button.tsx` | shadcn/ui Button with FPL variants |
| `src/components/ui/input.tsx` | shadcn/ui Input |
| `src/components/ui/select.tsx` | shadcn/ui Select (Radix UI primitive) |
| `src/components/ui/badge.tsx` | shadcn/ui Badge |
| `src/components/ui/card.tsx` | shadcn/ui Card |
| `src/components/ui/sheet.tsx` | shadcn/ui Sheet (mobile sidebar drawer) |
| `src/test/setup.ts` | Vitest + jsdom + `@testing-library/jest-dom` bootstrap |

---

## API client (`src/api/client.ts`)

The client wraps `fetch` with typed return values from `@fpl/contracts`. Base URL is read from `VITE_API_BASE_URL` at build time, defaulting to `http://localhost:4000/api`.

```ts
getOverview()                          // → Promise<OverviewResponse>
getPlayers(params?)                    // → Promise<PlayerCard[]>
getPlayer(playerId)                    // → Promise<PlayerDetail>
getFixtures(params?)                   // → Promise<FixtureCard[]>
resolveAssetUrl(imagePath)             // → string | null
```

`getPlayers` accepts an optional params object: `{ search?, position?, sort?, team? }`.
`getFixtures` accepts `{ event?, team? }` — both map to query parameters on the `/api/fixtures` endpoint.

---

## Theming (`src/styles/global.css`)

Tailwind v4 is configured entirely through CSS using `@theme inline`. No `tailwind.config.ts` file is needed. The FPL color palette is defined once and mapped to shadcn/ui CSS variable names:

```css
@theme inline {
  --font-display: "Syne", sans-serif;   /* headings */
  --font-sans: "Inter", sans-serif;      /* body */

  --color-primary: var(--primary);       /* #e90052 magenta */
  --color-accent:  var(--accent);        /* #00ffbf teal */
  --color-fpl-purple: #37003c;
}

:root {
  --background: 267 97% 5%;   /* deep purple-black */
  --primary:    342 100% 46%; /* magenta */
  --accent:     160 100% 50%; /* teal */
}
```

This approach means `bg-primary`, `text-accent`, `border-white/10`, and all shadcn utility classes resolve correctly with no additional config.

---

## GlowCard component

`GlowCard` and `BGPattern` (in `src/components/ui/glow-card.tsx`) are shared primitives used across all pages.

**GlowCard**: tracks the mouse pointer via `pointermove` and applies a radial gradient glow to the card border that follows the cursor. The hue shifts based on the `glowColor` prop (`"purple"` | `"magenta"` | `"teal"`).

**BGPattern**: renders a full-bleed background layer with either a grid or dots pattern, with optional radial fade masks. Used as a subtle texture behind page content.

---

## Responsive design

Layout uses Tailwind breakpoints:

- **Mobile** (`< lg`): sidebar collapses into a Sheet drawer triggered by a hamburger button; single-column layouts; truncated stats
- **Desktop** (`lg+`): sticky sidebar renders at full width; multi-column bento grids; full stat tables visible

The sidebar toggle uses a `Sheet` component (from shadcn/ui) — a slide-in panel driven by Radix Dialog primitives, fully accessible with keyboard navigation and focus trapping.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:4000/api` | API base URL injected at build time by Vite |

Set in the root `.env` file. The value is baked into the bundle at build time — changing it requires a rebuild.
