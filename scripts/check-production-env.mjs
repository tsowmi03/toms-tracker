import fs from 'node:fs'
import { loadEnv } from 'vite'

const env = loadEnv('production', process.cwd(), '')
const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_OWNER_UID',
]
const missing = required.filter((key) => !env[key]?.trim())
if (missing.length) {
  console.error(`Production Firebase configuration is incomplete: ${missing.join(', ')}`)
  process.exit(1)
}

const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
if (rules.includes('REPLACE_WITH_FIREBASE_OWNER_UID')) {
  console.error('firestore.rules still contains the owner UID placeholder.')
  process.exit(1)
}
if (!rules.includes(`request.auth.uid == '${env.VITE_FIREBASE_OWNER_UID}'`)) {
  console.error('The Firestore owner UID does not match VITE_FIREBASE_OWNER_UID.')
  process.exit(1)
}

console.log('Production Firebase configuration and owner rule are ready.')
