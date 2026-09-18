'use client';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { McciaLogo } from '../mccia-brand';
import '../reconciliation.css';
export default function Login() {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = new FormData(event.currentTarget);
    const value = (key: string) => {
      const entry = values.get(key);
      return typeof entry === 'string' ? entry : '';
    };
    try {
      const response = await fetch(
        '/api/auth/' + (register ? 'sign-up/email' : 'sign-in/email'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(register ? { 'x-fleet-invitation': value('code') } : {}),
          },
          body: JSON.stringify({
            email: value('email'),
            password: value('password'),
            ...(register ? { name: value('name') } : {}),
          }),
        },
      );
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw Error(
          result.message ??
            'Unable to sign in. Check your details and try again.',
        );
      const requested =
        new URLSearchParams(location.search).get('return_to') ?? '/';
      const target = new URL(requested, location.origin);
      location.assign(
        target.origin === location.origin &&
          !['/login', '/logout'].includes(target.pathname)
          ? target.pathname + target.search + target.hash
          : '/',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in is unavailable.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#f5f6f7',
      }}
    >
      <section
        className="panel"
        style={{ width: '100%', maxWidth: 440, padding: 32 }}
      >
        <McciaLogo className="mccia-login-logo" />
        <p className="welcome-kicker">MCCIA · CAR BOOKING DETAILS</p>
        <h1>{register ? 'Activate your access' : 'Welcome back'}</h1>
        <p className="muted">
          {register
            ? 'Use the invitation provided by your administrator.'
            : 'Sign in with your company email and Car Booking Details password.'}
        </p>
        <form
          onSubmit={submit}
          style={{ display: 'grid', gap: 18, marginTop: 24 }}
        >
          {register && (
            <label htmlFor="auth-name">
              Full name
              <Input
                id="auth-name"
                name="name"
                autoComplete="name"
                required
                maxLength={100}
              />
            </label>
          )}
          <label htmlFor="auth-email">
            Company email
            <Input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </label>
          <label htmlFor="auth-password">
            Password
            <Input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={register ? 12 : undefined}
              maxLength={128}
              required
            />
          </label>
          {register && (
            <label htmlFor="auth-code">
              Invitation code
              <Input
                id="auth-code"
                name="code"
                type="password"
                autoComplete="off"
                required
              />
              <small>
                Codes are private, valid for one use and tied to your email.
              </small>
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <Button disabled={busy} type="submit">
            {busy ? 'Please wait…' : register ? 'Activate access' : 'Sign in'}
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setRegister(!register);
            setError('');
          }}
          style={{ marginTop: 16 }}
        >
          {register ? 'Return to sign in' : 'I have an invitation'}
        </Button>
        <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
          For account recovery, contact your Car Booking Details administrator.
        </p>
      </section>
    </main>
  );
}
