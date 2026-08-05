import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthContext'

export function AuthScreen() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setNotice(null)
    try {
      if (creating) await auth.createAccount(email.trim(), password)
      else await auth.signInWithEmail(email.trim(), password)
    } catch {
      // The provider exposes a safe, user-facing error.
    } finally {
      setSubmitting(false)
    }
  }

  const resetPassword = async () => {
    if (!email.trim()) {
      setNotice('Enter your email address first.')
      return
    }
    setSubmitting(true)
    try {
      await auth.resetPassword(email.trim())
      setNotice('Password reset email sent.')
    } catch {
      setNotice(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>Tom’s Tracker</span>
        </div>
        <div className="auth-heading">
          <span>Private workspace</span>
          <h1>{creating ? 'Create your account' : 'Welcome back'}</h1>
          <p>{creating ? 'Create a private board that stays in sync across your devices.' : 'Sign in to keep your board in sync across your devices.'}</p>
        </div>

        <button
          className="google-button"
          type="button"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true)
            try { await auth.signInWithGoogle() } catch { /* handled by provider */ }
            finally { setSubmitting(false) }
          }}
        >
          <span className="google-mark">G</span>
          Continue with Google
        </button>

        <div className="auth-divider"><span>or use email</span></div>

        <form onSubmit={submit} className="auth-form">
          <label>
            <span>Email address</span>
            <input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); auth.clearError() }} required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={(event) => { setPassword(event.target.value); auth.clearError() }} minLength={6} required />
          </label>
          {auth.error && <p className="auth-error" role="alert">{auth.error}</p>}
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          <button className="auth-submit" disabled={submitting}>{submitting ? 'Please wait…' : creating ? 'Create account' : 'Sign in'}</button>
        </form>

        {!creating && <button className="forgot-button" type="button" onClick={resetPassword} disabled={submitting}>Forgot password?</button>}
        {auth.signUpEnabled && (
          <button className="auth-switch" type="button" onClick={() => { setCreating(!creating); auth.clearError(); setNotice(null) }}>
            {creating ? 'Already have an account? Sign in' : 'Need an account? Create one'}
          </button>
        )}
        <p className="auth-footnote">Your workspace is encrypted in transit and isolated to your signed-in account.</p>
      </section>
    </main>
  )
}
