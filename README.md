# Tom's Tracker

A local-first, Jira-inspired personal task tracker with Firebase authentication and cross-device sync.

## Production infrastructure

- Firebase project: `toms-tracker-tsowmi`
- Firestore: Native mode in Sydney (`australia-southeast1`) with delete protection
- Authentication: owner account only; public account creation is disabled
- Hosting: `https://toms-tracker-tsowmi.web.app`
- Source: private GitHub repository `tsowmi03/toms-tracker`

The production Firebase configuration and owner binding live in ignored `.env.local` and `.env.production.local` files. Never commit those files.

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

The live application uses Firebase Authentication and Cloud Firestore. Each task and area is stored as a separate document beneath the authenticated owner:

```text
users/{ownerUid}
├── areas/{areaId}
└── tasks/{taskId}
```

### Local configuration

Copy `.env.example` to `.env.local` for development and enter the Firebase Web app values. Set `VITE_FIREBASE_OWNER_UID` to the UID copied above.

For a production build, use `.env.production.local` with the same variables. Keep `VITE_ALLOW_SIGN_UP=false`; the live Firebase project also rejects new account creation at the service level.

Firebase Web configuration values identify the project and are shipped to the browser. They are not server credentials. Firestore Security Rules are the data-access boundary.

### Owner lock

The production rules are pinned to the live owner UID. If the owner or Firebase project changes, update the UID in `firestore.rules` and `VITE_FIREBASE_OWNER_UID` together.

The production build gate checks that:

- Required Firebase values are present.
- The owner placeholder has been replaced.
- The owner UID in the environment matches the UID in the rules.

## Validate and deploy

```bash
npm run test
npm run test:rules
npm run build:production
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

Do not deploy Firestore rules until `npm run test:rules` passes. Do not use the ordinary `npm run build` for a live release; it intentionally permits local development mode.

## Storage and migration behaviour

- A browser with existing local tracker data uploads that workspace the first time the owner signs in.
- A new browser starts with the standard areas and no sample tasks.
- The owner profile document records that initialisation has occurred, preventing deleted tasks from being recreated later.
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
| `npm run build:production` | Require valid Firebase and owner configuration, then build |
| `npm run preview` | Preview the built application |

## Current capabilities

- Responsive desktop and mobile interface
- Installable web app manifest and same-origin offline shell
- Email/password and Google authentication
- Owner UID check in both the client and Firestore rules
- Realtime per-document Firestore sync
- Multi-tab persistent Firestore cache
- One-time migration from browser-local data
- Drag-and-drop Kanban board on desktop
- Task editing with areas, priorities, dates, notes, tags, and daily focus
- Search, filtering, local mirroring, and JSON backup export
- Keyboard shortcuts: `N` for a new task and `Command/Ctrl + K` for search

## Remaining operational hardening

- Enable Firebase App Check for the hosted domain.
- Add budget alerts if the Firebase project is upgraded from the free plan.
- Complete a backup and restore test.
- Review Authentication and Firestore usage periodically.
