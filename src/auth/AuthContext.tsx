import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { firebaseConfigured, getFirebaseServices, signUpEnabled } from '../firebase'

interface AuthContextValue {
  configured: boolean
  signUpEnabled: boolean
  user: User | null
  loading: boolean
  error: string | null
  signInWithEmail: (email: string, password: string) => Promise<void>
  createAccount: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function friendlyAuthError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/weak-password': 'Use a password with at least six characters.',
  }
  return messages[code] ?? 'Authentication could not be completed. Please try again.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(firebaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const services = getFirebaseServices()
    if (!services) {
      setLoading(false)
      return
    }

    void setPersistence(services.auth, browserLocalPersistence)
    void getRedirectResult(services.auth).catch((authError) => setError(friendlyAuthError(authError)))

    return onAuthStateChanged(services.auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    configured: firebaseConfigured,
    signUpEnabled,
    user,
    loading,
    error,
    clearError: () => setError(null),
    signInWithEmail: async (email, password) => {
      const services = getFirebaseServices()
      if (!services) return
      setError(null)
      try {
        await signInWithEmailAndPassword(services.auth, email, password)
      } catch (authError) {
        setError(friendlyAuthError(authError))
        throw authError
      }
    },
    createAccount: async (email, password) => {
      const services = getFirebaseServices()
      if (!services || !signUpEnabled) return
      setError(null)
      try {
        await createUserWithEmailAndPassword(services.auth, email, password)
      } catch (authError) {
        setError(friendlyAuthError(authError))
        throw authError
      }
    },
    signInWithGoogle: async () => {
      const services = getFirebaseServices()
      if (!services) return
      setError(null)
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      try {
        await signInWithPopup(services.auth, provider)
      } catch (authError) {
        const code = typeof authError === 'object' && authError && 'code' in authError ? String(authError.code) : ''
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(services.auth, provider)
          return
        }
        setError(friendlyAuthError(authError))
        throw authError
      }
    },
    resetPassword: async (email) => {
      const services = getFirebaseServices()
      if (!services) return
      setError(null)
      try {
        await sendPasswordResetEmail(services.auth, email)
      } catch (authError) {
        setError(friendlyAuthError(authError))
        throw authError
      }
    },
    signOut: async () => {
      const services = getFirebaseServices()
      if (services) await firebaseSignOut(services.auth)
    },
  }), [error, loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
