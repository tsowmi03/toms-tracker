import fs from 'node:fs'
import { loadEnv } from 'vite'

const env = loadEnv('production', process.cwd(), '')
const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
]
const missing = required.filter((key) => !env[key]?.trim())
if (missing.length) {
  console.error(`Production Firebase configuration is incomplete: ${missing.join(', ')}`)
  process.exit(1)
}

if (env.VITE_ALLOW_SIGN_UP !== 'true') {
  console.error('Production account registration is disabled. Set VITE_ALLOW_SIGN_UP=true.')
  process.exit(1)
}

const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
if (!rules.includes('request.auth.uid == userId')) {
  console.error('Firestore rules are not scoped to each signed-in user.')
  process.exit(1)
}
if (!rules.includes('isBoardMember(boardId)') || !rules.includes('match /boardInvites/{inviteId}')) {
  console.error('Firestore rules do not contain the shared-board membership boundary.')
  process.exit(1)
}
if (/request\.auth\.uid\s*==\s*['"]/.test(rules)) {
  console.error('Firestore rules still contain a hard-coded user UID.')
  process.exit(1)
}

console.log('Production Firebase configuration and board-membership rules are ready.')
