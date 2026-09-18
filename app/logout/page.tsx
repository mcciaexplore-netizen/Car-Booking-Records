'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
export default function Logout() {
  const [error, setError] = useState('');
  return (
    <main style={{ padding: 40 }}>
      <h1>Sign out of Car Booking Details?</h1>
      <Button
        onClick={async () => {
          try {
            const result = await fetch('/api/auth/sign-out', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
            });
            if (!result.ok) throw Error();
            location.assign('/login');
          } catch {
            setError('Could not sign out. Try again.');
          }
        }}
      >
        Sign out
      </Button>{' '}
      <Link href="/">Return to dashboard</Link>
      <p role="alert">{error}</p>
    </main>
  );
}
