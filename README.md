# Tom's Tracker

A local-first, Jira-inspired task tracker with personal and shared boards, Firebase authentication, and cross-device sync.

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

The live application uses Firebase Authentication and Cloud Firestore. A small reference under each user lists the boards available to that account. Board content and membership live under the board itself:

```text
users/{userId}
└── boardRefs/{boardId}

boards/{boardId}
├── members/{userId}
├── areas/{areaId}
└── tasks/{taskId}

boardInvites/{randomInviteToken}
```

### Local configuration

Copy `.env.example` to `.env.local` for development and enter the Firebase Web app values.

For a production build, use `.env.production.local` with the same variables and set `VITE_ALLOW_SIGN_UP=true`.

Firebase Web configuration values identify the project and are shipped to the browser. They are not server credentials. Firestore Security Rules are the data-access boundary.

### Board access

Firestore rules still require the authenticated UID to match `{userId}` for profiles and board references. Personal and shared board content uses membership documents as the access boundary:

- Personal boards have only their owner as a member and cannot create invites.
- Shared boards allow every member to read and edit tasks and areas.
- Only the owner can create invite links or remove members.
- Members can leave a shared board themselves.
- Invite documents can be opened only by exact, cryptographically random token and cannot be listed.
- Invite links expire after seven days.
- Removing or leaving a board immediately blocks access to its content. Removing a member also revokes the invite they used.

The production build gate checks that:

- Required Firebase values are present.
- Account registration is enabled for the production build.
- Firestore rules use per-user UID matching and board-membership checks, with no hard-coded account UID.

## Validate and deploy

```bash
npm run test
npm run test:rules
npm run build:production
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

Do not deploy Firestore rules until `npm run test:rules` passes. Do not use the ordinary `npm run build` for a live release; it intentionally permits local development mode.

## Storage and migration behaviour

- A new account starts with a personal board containing the standard areas and no sample tasks.
- Users can create additional personal boards or shared boards.
- Existing per-user tasks and areas are copied into the first personal board on first use. That original board temporarily mirrors later edits to the legacy documents so a hosting rollback retains current personal tasks.
- Migration is resumable and is marked complete only after every task and area is copied.
- Each board's browser mirror is scoped by both UID and board ID, preventing account or board switching from exposing the wrong cached data.
- Shared boards are joined through an expiring link; no email address directory is exposed to clients.
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
- Persistent light and dark appearance modes
- Installable web app manifest and same-origin offline shell
- Email/password and Google authentication
- Multiple personal and shared task boards
- Expiring invite links and shared-board member management
- Membership-scoped Firestore access
- Realtime per-document Firestore sync
- Multi-tab persistent Firestore cache and per-board offline mirrors
- Drag-and-drop Kanban board on desktop
- Custom board areas and task editing with priorities, dates, notes, tags, and daily focus
- Search, filtering, local mirroring, and JSON backup export
- Keyboard shortcuts: `N` for a new task and `Command/Ctrl + K` for search

## Remaining operational hardening

- Enable Firebase App Check for the hosted domain.
- Add budget alerts if the Firebase project is upgraded from the free plan.
- Complete a backup and restore test.
- Review Authentication and Firestore usage periodically.
