# Strict Material Design 3 / Material Symbols Enforcement

## Icons
- **NEVER** use Lucide, Heroicons, Font Awesome, or any non-Material icon library.
- **NEVER** use inline SVG paths for icons, unicode/emoji characters as icons, or HTML entities (`&times;`, `✕`, `⚠`, `⏹`, `⏸`, etc.).
- **ALL** icons must use the `<Icon>` component from `@/components/ui/Icon`.
- Icon names must reference Material Symbols (`material-symbols-outlined`) — see https://fonts.google.com/icons.
- Always add the `Icon` import: `import { Icon } from '@/components/ui/Icon'`.

### Size conventions for `className` on `<Icon>`
| Sizing context | `className` |
|---|---|
| Inline with `text-xs` body text | `text-xs` |
| Small button / tag | `text-sm` |
| Default button / list item | `text-base` |
| Header / toolbar icon | `text-xl` |
| Section heading | `text-2xl` |
| Large empty-state icon | `text-5xl` |

## Typography
- Use M3 utility classes: `m3-title-medium`, `m3-title-small`, `m3-body-medium`, `m3-body-small`, `m3-label-large`, `m3-label-medium`, `m3-label-small`.
- Use `text-on-surface`, `text-on-surface-variant`, `text-primary`, `text-error` for semantic text colors — never hardcoded gray/brand colors.

## Colors
- Use M3 CSS variable tokens: `var(--md-surface)`, `var(--md-primary)`, `var(--md-on-surface)`, `var(--md-surface-container)`, `var(--md-outline)`, `var(--md-error)`, `var(--md-success)`, `var(--md-warning)`, `var(--md-secondary)`.
- Use Tailwind M3 utility classes: `bg-surface`, `bg-surface-container`, `bg-primary`, `bg-primary-container`, `bg-error`, `bg-error-container`, `bg-success-container`, `bg-secondary-container`, `text-on-surface`, `text-on-surface-variant`, `text-primary`, `text-error`, `border-outline`, `border-outline-variant`.
- **NEVER** hardcode Tailwind gray/brand colors like `text-gray-500`, `bg-blue-100`, `text-red-600`, `border-gray-200`. Replace with M3 tokens.

## Surfaces & Elevation
- Use `shadow-m3-1` through `shadow-m3-5` for elevation — never arbitrary shadow values.
- `m3-elevated`, `m3-card`, `m3-dialog` utilities for component containers.

## Theme
- Light theme is the default (`:root`), dark theme applied via `.dark` class.
- Theme follows OS preference by default.
- Manual toggle overrides and persists to localStorage.

## Dialogs & Modals
- Backdrop: `bg-black/30`.
- Dialog container: `bg-surface rounded-xl shadow-m3-4`.
- Close button: `<Icon name="close" />`.

## Inputs
- Use `m3-input` class for text inputs.
- Select elements: `rounded border border-outline p-2 text-sm bg-surface`.

## Buttons
- Filled: `m3-button`.
- Tonal: `m3-button-tonal`.
- Outlined: `m3-button-outlined`.

## Radix UI Components (preferred)
- **ALWAYS** use proven Radix UI components instead of custom implementations for common UI patterns.
- **NEVER** use `alert()`, `confirm()`, or `window.confirm()` — use the `<ConfirmDialog>` component via the `useConfirm` hook for all user-facing warnings, confirmations, and alerts.
- Radix packages already installed: `react-dialog`, `react-select`, `react-separator`, `react-tooltip`, `react-tabs`, `react-toast`, `react-dropdown-menu`, `react-label`, `react-slot`.
- Use our wrapper components in `@/components/ui/`:
  - `<TextField>` — M3 text input with floating label
  - `<SelectField>` — Radix-based M3 select dropdown with portal (no clipping)
  - `<Tooltip>` — Radix-based tooltip replaces `title` attributes
  - `<ConfirmDialog>` — Radix Dialog-based confirmation modal
- For modals: use `@radix-ui/react-dialog` (`Dialog.Root`, `Dialog.Portal`, `Dialog.Overlay`, `Dialog.Content`, `Dialog.Title`, `Dialog.Description`, `Dialog.Close`).
- For separators: use `@radix-ui/react-separator` (`<Separator.Root orientation="vertical" />`).
- **NEVER** build custom modal/dropdown/tooltip/separator implementations — Radix handles accessibility, focus trapping, keyboard navigation, and portal rendering.

## E2E Tests
- **ALWAYS run E2E tests before committing and pushing any changes** — they catch regressions in both frontend and backend.
- **ALWAYS run and update unit tests before committing and pushing** — run `npm test` across all workspaces (shared, worker, backend, frontend) and update any tests that break due to your changes.
- Workflow:
  ```bash
  # Start Docker stack (infra + backend + frontend + worker + mock-llm)
  docker compose -f docker-compose.e2e.yml up -d --wait
  
  # Run tests headless
  npx playwright test --config frontend/playwright.config.ts --retries=0
  
  # Or with browser for debugging
  npx playwright test --config frontend/playwright.config.ts --retries=0 --headed
  
  # Clean up
  docker compose -f docker-compose.e2e.yml down -v --timeout 10
  ```
- Test suites: frontend/e2e/ — 46 tests across 13 spec files
- Tests use `data-testid` attributes for reliable locators — add them when creating new components
- Use `uniqueFlowName()` from `helpers/api.ts` for unique flow names to avoid 409 conflicts
- The mock LLM server at `test/mock-llm/` provides OpenAI-compatible responses for LLM Agent node tests
- Debug executions use `debugExecute()` from `helpers/stream.ts` which reads SSE events

## Checking for compliance
- Run `npm run build` to catch TypeScript errors.
- Run E2E tests before every commit.
- Visually confirm all icons render correctly in both light and dark modes.
- If the flow editor returns 404 after a git pull/restart, delete `frontend/.next/dev/types/routes.d.ts` and restart Next.js — it's a generated file that can get corrupted.
