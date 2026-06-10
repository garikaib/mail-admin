# Frontend Architecture Plan

## Goal

Refactor the React frontend into a maintainable, secure, modular app with a clear component hierarchy, minimal state duplication, and one-way data flow.

## Current Problems

- `frontend/src/App.jsx` is still acting as a monolith and owns too much UI state and orchestration.
- Several helper functions are duplicated between `App.jsx` and extracted panels.
- Feature boundaries are blurry, which makes the app harder to test, extend, and secure.
- Authentication and browser storage handling should be reviewed for safer defaults.

## Architecture Principles

- Break the UI into focused components and feature domains.
- Keep components pure where possible.
- Store only minimal state; derive the rest during render.
- Lift state only to the nearest common parent that needs it.
- Use Effects only for external synchronization such as network calls, browser APIs, or third-party widgets.
- Keep network, validation, and formatting logic out of presentational components.
- Treat all server data as untrusted input and render it safely.

These principles follow React guidance on component hierarchy, pure rendering, state structure, state lifting, and avoiding unnecessary Effects.

## Security Baseline

- Avoid `dangerouslySetInnerHTML` unless the content is sanitized and the use case is explicit.
- Prefer text rendering and structured JSX over HTML injection.
- Keep inline scripts and inline event handlers out of the app.
- Use a strict Content Security Policy where possible.
- Prefer short-lived session-based auth over long-lived bearer tokens in browser storage.
- Validate and sanitize all user-controlled values before using them in HTML, URL, JS, or CSS contexts.

These controls align with OWASP guidance for XSS prevention and CSP hardening.

## Target Folder Structure

```text
frontend/src/
  app/
    App.jsx
    routes.jsx
    providers.jsx
  features/
    auth/
    domains/
    credentials/
    plans/
    registrations/
    users/
    logs/
    server-health/
    geo-auth/
  shared/
    api/
    components/
    hooks/
    lib/
    styles/
```

## Refactor Plan

### 1. Extract shared utilities

Move helper functions out of `App.jsx` into `shared/lib` so they are reusable and testable.

Candidates include:

- date parsing and formatting
- flag helpers
- config path helpers
- nginx directive helpers
- password generation
- safe text formatting helpers

### 2. Extract shared UI primitives

Create reusable components for:

- buttons
- inputs
- modal shells
- cards
- tabs
- badges
- empty states
- loading states
- confirm dialogs

This keeps each feature from reimplementing the same UI patterns.

### 3. Move feature logic into domain folders

Each major tab or workflow should own its own components, local state, and API calls.

Feature folders should cover:

- auth
- domains
- credentials
- plans
- registrations
- users
- logs
- server health
- geo auth

### 4. Shrink `App.jsx`

`App.jsx` should become a shell that:

- initializes global providers
- selects the active page or tab
- passes top-level permissions and session state down
- renders the main layout

It should not contain domain workflows or large sets of feature state.

### 5. Centralize API access

Create one API client layer that handles:

- base URL handling
- auth headers or session credentials
- error normalization
- response parsing
- retry policy where appropriate

Keep fetch logic out of view components unless the request is trivial and local.

### 6. Simplify state

Restructure state using React principles:

- keep local state local
- compute derived values during render
- group related state together
- avoid duplicate copies of the same data
- lift shared state only when multiple components must coordinate

Where a feature has a large related state set, use a reducer or a feature hook instead of many unrelated `useState` calls.

### 7. Formalize auth and permission handling

Create an auth boundary that clearly handles:

- login
- logout
- session restoration
- permission checks
- unauthorized and expired-session states

Do not rely on hidden UI alone for access control.

### 8. Make destructive flows explicit

Standardize destructive and sensitive actions with:

- confirmation modals
- consistent loading states
- clear success and error feedback
- audit-friendly action labels

This is especially important for domain deletion, credential management, password resets, and server actions.

### 9. Add validation and test coverage

Add tests for:

- login flow
- permission gating
- domain workflows
- credential CRUD
- server config editing
- password reset flow
- destructive confirmations

Add linting and code review rules that discourage duplicated helpers and oversized components.

## Recommended Execution Order

1. Extract shared helpers from `App.jsx`.
2. Extract shared UI components.
3. Move each feature into its own folder.
4. Reduce `App.jsx` to shell logic only.
5. Centralize API access and auth/session handling.
6. Tighten security practices and remove unsafe rendering paths.
7. Add tests for critical flows.

## Definition Of Done

- `App.jsx` is thin and orchestration-only.
- Feature logic lives in domain folders.
- Shared helpers are not duplicated.
- Derived state is computed, not stored twice.
- Security-sensitive rendering paths are explicit and reviewed.
- The frontend has a stable structure that new contributors can follow without reading the whole app first.
