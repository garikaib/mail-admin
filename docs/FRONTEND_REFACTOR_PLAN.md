# Frontend Refactor Plan v4 (Vercel React Best Practices Clean Aligned)

This plan integrates the **Vercel React Best Practices Guidelines** (focusing on `rerender-` optimization, `bundle-` optimization, and `client-` data fetching patterns) to eliminate the remaining gaps in our React frontend.

---

## 🔍 Audit & Alignment Checklist (Vercel Skill Alignment)

Below is an audit of our current frontend codebase against the Vercel React Best Practices rules:

| Rule Category | Vercel Rule | Status in Code | Gaps & Solutions |
| :--- | :--- | :--- | :--- |
| **Re-render Optimization** | `Defer State Reads to Usage Point` | ⚠️ Partially Aligned | Many modal states (e.g., `showAddGeoExceptionModal`, `showAddUserModal`) and form text states are defined in `App.jsx`, causing full-shell rerenders on every keystroke/toggle. **Solution:** Move all feature-specific states to local controllers (`useServerHealthController`, `useGeoAuthController`, etc.). |
| **Re-render Optimization** | `Split Combined Hook Computations` | ❌ Not Aligned | The Zustand store is a single monolith (`useAppStore.js`). Although modular stores exist, features still rely on `useAppStore.js`. **Solution:** Migrate remaining screens to the modular stores and delete `useAppStore.js`. |
| **Re-render Optimization** | `Calculate Derived State During Rendering` | ⚠️ Partially Aligned | Some derived permissions/tab states are stored in state. **Solution:** Compute permissions and paths dynamically on render using `usePermissions` and window location. |
| **Bundle Size Optimization** | `Conditional Module Loading` | ⚠️ Partially Aligned | Screens are lazy-loaded, but root-level dependencies, heavy helpers (like Nginx configuration editors), and state orchestration pull eagerly into `App.jsx`. **Solution:** Move all screen-specific imports, handlers, and modals inside the lazy-loaded screen directories. |
| **Client-Side Data Fetching** | `Client-Side Data Fetching (Lazy Fetching)` | ❌ Not Aligned | All data (domains, plans, geo-settings, health, logs, etc.) is fetched eagerly inside `App.jsx` on app mount, even if the user never navigates to those tabs. **Solution:** Move fetch calls into screen controllers (`useEffect` triggered when screens mount). |
| **Advanced Component Patterns** | `Props Drilling` | ❌ Not Aligned | Screens accept up to 50+ props from `App.jsx` (callbacks, modal states, setters). This is brittle and difficult to maintain. **Solution:** Connect screen controllers directly to domain stores, removing all drilled props from `App.jsx`. |

---

## 🛠️ Step-by-Step Refactoring Execution Order

### Step 1: Split the Monolithic Zustand Store
Remove all usages of the deprecated monolithic `useAppStore.js` and delete it entirely. Ensure all domain-driven stores inside `frontend/src/store/` are fully populated and consumed:
1. `useAuthStore.js`: Sourced from credentials, token, current user object, and authentication API calls.
2. `useUiStore.js`: Controls global layout things like `activeTab`, mobile menus, toast notifications (`successMsg`/`errorMsg`), and the global `confirmModal` configuration.
3. `useDomainsStore.js`: Holds domains data, plan templates, mailboxes, and aliases.
4. `useCredentialsStore.js`: Holds Cloudflare API credentials and Zone lookup caches.
5. `useGeoAuthStore.js`: Coordinates mail/SSH geolocation setting blocks, bans, and custom exception records.
6. `useSystemHealthStore.js`: Tracks server CPU/RAM status, service lists, and configs.

### Step 2: Establish Self-Contained Feature Hooks (Screen Controllers)
Create React custom hooks that wrap all states, queries, and mutations for each feature screen:
- **`useDomainsController`**: `showAddDomainModal`, `fetchDomains()`, `handleDeleteDomain()`, mailbox & alias operations.
- **`useCredentialsController`**: DNS edits, zone scans, credential creation/deletion.
- **`useGeoAuthController`**: Global rule saves, exception add/delete, SSH logs retrieval.
- **`useServerHealthController`**: System monitors, service start/stops, Nginx configuration edits.
- **`useUsersController`**: Admin accounts management.
- **`usePlansController`**: Mail quota templates.
- **`useRegistrationsController`**: Domain registration state.
- **`useLogsController`**: Audit logs polling.

### Step 3: De-Clutter and Thin the App Shell (`App.jsx`)
Strip `App.jsx` down to less than ~400 lines:
- Remove all feature state declarations (`useState` / `useEffect`).
- Eliminate all API mutation wrappers.
- Keep only authentication bootstrap checks (`/auth/me`), global layout frame (header, navigation panel), toast alert components, and the single global confirm dialog.

### Step 4: Revamp lazy-loaded Screen Entries
Update lazy screen targets (e.g., `DomainsScreen.jsx`, `CredentialsScreen.jsx`, `GeoAuthScreen.jsx`, `ServerHealthScreen.jsx`, etc.) so they consume their respective controller hook directly. No props will be drilled from `App.jsx`.

---

## 📈 Verification Checks
- Verify local bundle outputs via `npm run build` to confirm chunks remain code-split.
- Check state isolation: updating a draft Cloudflare API Key or typing in a modal must not trigger rendering cycles on other tabs.
- Ensure production build deploys cleanly via the deploy script.
