/** Server-only access policy. Public viewing is the owner's selected default. */
export function publicAccessEnabled() {
  const mode = process.env.FLEET_ACCESS_MODE;
  return mode === undefined || mode === '' || mode === 'public';
}
