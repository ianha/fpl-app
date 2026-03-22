# Design System Master File

> **LOGIC:** Check `design-system/pages/[page-name].md` first. If it exists, it overrides this file.

**Project:** FPL Analytics | **Category:** Analytics Dashboard

## Global Rules

### Colors & Typography

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#1E40AF` | `--color-primary` |
| Secondary | `#3B82F6` | `--color-secondary` |
| CTA/Accent| `#F59E0B` | `--color-cta` |
| Background| `#F8FAFC` | `--color-background` |
| Text | `#1E3A8A` | `--color-text` |

- **Heading**: Fira Code | **Body**: Fira Sans
- **Theme**: Data, analytics, precise, dense dashboard.

### Spacing & Shadows
- **Spacing**: `xs` (4px), `sm` (8px), `md` (16px), `lg` (24px), `xl` (32px), `2xl` (48px)
- **Shadows**: `sm` (subtle lift), `md` (cards/inputs), `lg` (hover state/dropdowns), `xl` (modals).

## Component Guidelines

- **Cards**: Background `#F8FAFC`, rounded 12px, shadow `md`. Elevate to `lg` on hover.
- **Buttons**:
  - Primary: `#F59E0B` background, white text.
  - Secondary: Transparent with `#1E40AF` border.
- **Inputs**: 12px padding, `#E2E8F0` border. `:focus` states use `#1E40AF` ring.
- **Modals**: Max-width 500px, rounded 16px, background white.

## Patterns & Anti-Patterns

**Dashboard Design Rule**: Space-efficient grids, multiple widgets, minimal padding, high data density.

### DO NOT USE (Anti-Patterns):
- ❌ Emojis as icons (use SVGs explicitly: Heroicons/Lucide).
- ❌ Missing `cursor:pointer` on clickable items.
- ❌ Low contrast colors.
- ❌ Instant hover transitions (use 150-300ms ease).
- ❌ Emojis, ornate designs, hidden navs.
