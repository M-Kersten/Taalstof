/** Korte, vaste sleutel voor een reeks waarden: sha-256 via Web Crypto, in de browser en in Node. */
export async function sleutel(...delen: unknown[]): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(delen));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/** Bestandsvriendelijke naam: geen accenten, geen vreemde tekens. */
export function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
