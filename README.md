# Tom's Tracker

A local-first, Jira-inspired personal task tracker with Firebase authentication and cross-device sync.

## Production infrastructure

- Firebase project: `toms-tracker-tsowmi`
- Firestore: Native mode in Sydney (`australia-southeast1`) with delete protection
- Authentication: self-service Google and email/password accounts
- Hosting: `https://toms-tracker-tsowmi.web.app`
- Source: private GitHub repository `tsowmi03/toms-tracker`

The production Firebase configuration lives in ignored `.env.local` and `.env.production.local` files. Never commit those files.

## Workflow

1. Capture loose thoughts in **Inbox**.
2. Move committed work into **To do**.
3. Keep only active work in **In progress**.
4. Move blocked or delegated work into **Waiting**.
5. Close finished work in **Done**.
6. Pin a deliberately short list to **Today**.

## Run locally

```bash
npm install
npm run dev
```

Without Firebase environment values, the app runs in local development mode and stores its workspace in the browser.

## Firebase architecture

The live application uses Firebase Authentication and Cloud Firestore. Every account has an independent workspace, with each task and area stored beneath that user's Firebase UID:

```text
users/{userId}
├── areas/{areaId}
└── tasks/{taskId}
```

### Local configuration

Copy `.env.example` to `.env.local` for development and enter the Firebase Web app values.

For a production build, use `.env.production.local` with the same variables and set `VITE_ALLOW_SIGN_UP=true`.

Firebase Web configuration values identify the project and are shipped to the browser. They are not server credentials. Firestore Security Rules are the data-access boundary.

### Per-user isolation

Firestore rules require the authenticated UID to match the `{userId}` in every document path. Users cannot list, read, create, update, or delete another user's profile, areas, or tasks.

There are no shared boards, workspace memberships, or cross-user task queries. Every account is independent.

The production build gate checks that:

- Required Firebase values are present.
- Account registration is enabled for the production build.
- Firestore rules use per-user UID matching and contain no hard-coded account UID.

## Validate and deploy

```bash
npm run test
npm run test:rules
npm run build:production
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

Do not deploy Firestore rules until `npm run test:rules` passes. Do not use the ordinary `npm run build` for a live release; it intentionally permits local development mode.

## Storage and migration behaviour

- A new account starts with the standard areas and no sample tasks.
- Each account's browser mirror uses a UID-scoped storage key, preventing account switching from exposing or copying another user's cached data.
- The user profile document records that initialisation has occurred, preventing deleted tasks from being recreated later.
- Firestore realtime listeners keep signed-in devices current.
- Firestore's persistent browser cache keeps established devices usable offline and queues changes for later synchronisation.
- The app maintains a local mirror and supports manual JSON backup export.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local development |
| `npm run test` | Run task and board logic tests |
| `npm run test:rules` | Run security rules against the Firestore emulator |
| `npm run build` | Build with local mode permitted |
| `npm run build:production` | Require valid Firebase and multi-user configuration, then build |
| `npm run preview` | Preview the built application |

## Current capabilities

- Responsive desktop and mobile interface
- Installable web app manifest and same-origin offline shell
- Email/password and Google authentication
- Self-service accounts with per-user client and Firestore isolation
- Realtime per-document Firestore sync
- Multi-tab persistent Firestore cache
- UID-scoped offline browser mirrors
- Drag-and-drop Kanban board on desktop
- Task editing with areas, priorities, dates, notes, tags, and daily focus
- Search, filtering, local mirroring, and JSON backup export
- Keyboard shortcuts: `N` for a new task and `Command/Ctrl + K` for search

## Remaining operational hardening

- Enable Firebase App Check for the hosted domain.
- Add budget alerts if the Firebase project is upgraded from the free plan.
- Complete a backup and restore test.
- Review Authentication and Firestore usage periodically.
