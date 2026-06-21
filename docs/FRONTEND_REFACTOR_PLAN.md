# Frontend Refactor Plan

## Goal
Refactor the React admin frontend so it aligns with the React best-practices skill:
- reduce unnecessary rerenders
- shrink the initial JS bundle
- isolate feature state
- keep the shell easy to reason about

## Current Problems

### 1. App shell owns too much
`frontend/src/App.jsx` currently imports and coordinates most feature areas directly. It also subscribes to a very large portion of the Zustand store in a single component.

Impact:
- feature updates can rerender the whole shell
- state ownership is blurry
- the file is hard to extend safely

### 2. Bundle is too eager
All major screens are loaded up front.

Impact:
- larger initial bundle
- slower time to interactive
- tabs the user never opens still ship on first load

### 3. Global store is too coarse
The shared store is convenient, but broad subscriptions make invalidation too wide.

Impact:
- unrelated state changes can rerender unrelated screens
- form state and domain state can leak into each other

### 4. Modal and form state is spread around
Temporary form fields and modal flags are mixed with feature data.

Impact:
- harder to debug
- easier to create stale or duplicated state
- more accidental rerenders

## Refactor Strategy

### Phase 1: Split shell from feature screens
Move each dashboard tab into a screen container:
- `DomainsScreen`
- `CredentialsScreen`
- `UsersScreen`
- `PlansScreen`
- `RegistrationsScreen`
- `GeoAuthScreen`
- `LogsScreen`
- `ServerHealthScreen`

Keep `App.jsx` focused on:
- auth/bootstrap
- route selection
- sidebar/header
- global host components like confirm modal and toast messages

### Phase 2: Lazy-load feature screens
Use `React.lazy` and `Suspense` so only the active screen loads.

Priority order:
- Logs
- Geo Auth
- Users
- Registrations
- Plans
- Server Health
- Domains/Credentials as needed

Add small loading fallbacks per screen so the UI stays responsive.

### Phase 3: Narrow store subscriptions
Replace broad `useAppStore()` reads with selectors.

Rules:
- each screen should subscribe only to the state it needs
- use shallow comparisons where useful
- do not read unrelated store data in the shell

Expected result:
- changing credentials should not rerender logs
- typing in one form should not redraw unrelated panels

### Phase 4: Move transient form state local
Keep temporary edit/create form inputs inside the screen or modal component that uses them.

Examples:
- credential add/edit form fields
- alias edit destination
- plan form inputs
- geo-auth form inputs

Only keep truly shared state in the global store.

### Phase 5: Standardize modal handling
Make modal presentation uniform:
- confirm modal
- delete modal
- form modal

Modal components should receive data and callbacks, not own unrelated feature state.

### Phase 6: Simplify derived state
Compute derived values during render when cheap, or memoize only when the cost is real.

Examples:
- selected tab data
- filtered lists
- permission-derived flags

Avoid syncing derived values into separate state unless there is a real user-editing need.

### Phase 7: Introduce feature controllers where needed
For complex screens, extract controller hooks:
- `useCredentialsController`
- `useDomainsController`
- `useUsersController`
- `useGeoAuthController`

These hooks should own:
- fetch logic
- mutation logic
- screen-specific side effects

### Phase 8: Split the store if selectors are not enough
If the store still feels too broad after selector cleanup, split it by domain:
- `useAuthStore`
- `useCredentialsStore`
- `useDomainsStore`
- `useUsersStore`
- `useLogsStore`
- `useGeoAuthStore`

Keep a small shared store only for:
- active tab
- global confirmations
- global notifications
- app-level loading/error banners

## Implementation Order

1. Extract screen containers from `App.jsx`.
2. Lazy-load the screens.
3. Convert store reads to selectors.
4. Move form state local.
5. Normalize modals.
6. Measure bundle and rerender behavior.
7. Split the store further only if needed.

## Success Criteria

- `App.jsx` is a shell, not a feature monolith
- initial bundle is smaller
- tab changes do not rerender unrelated screens
- modal behavior is predictable
- the codebase is easier to extend without regressions

## Notes

- Keep existing behavior stable during the refactor.
- Prefer incremental changes with build verification after each phase.
- Do not reintroduce temporary console logging in production code.
