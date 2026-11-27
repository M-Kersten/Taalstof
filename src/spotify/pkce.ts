/** PKCE voor de Spotify-login, met Web Crypto zodat het in de browser en in Node werkt. */
export function base64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createVerifier(): string {
  const b = new Uint8Array(64);
  crypto.getRandomValues(b);
  return base64url(b);
}

export async function challengeFor(verifier: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(d));
}
