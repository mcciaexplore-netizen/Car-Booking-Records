import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authConfigured, fleetAuth } from '../lib/auth';

// Compatibility names for the existing pages; identity now comes only from a
// signed, server-validated Fleet Desk session. Proxy identity headers are ignored.
export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  if (!authConfigured()) return null;
  const session = await fleetAuth().api.getSession({
    headers: await headers(),
  });
  if (!session) return null;
  return {
    userId: session.user.id,
    displayName: session.user.name,
    email: session.user.email,
    fullName: session.user.name,
  };
}
export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}
export function chatGPTSignInPath(returnTo: string) {
  return (
    '/login?return_to=' + encodeURIComponent(safeRelativeReturnPath(returnTo))
  );
}
export function chatGPTSignOutPath() {
  return '/logout';
}
export function safeRelativeReturnPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'https://app.local');
    if (
      url.origin !== 'https://app.local' ||
      ['/login', '/logout', '/callback'].includes(url.pathname)
    )
      return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}
