import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Les } from '../lesson/schema.js';
import type { TrackRef } from '../types.js';
import type { Instellingen } from './instellingen.js';

/** Eén les zoals hij in Supabase staat: de les zelf en wat de pagina nodig heeft om hem te tonen. */
export interface LesRij {
  id: string;
  /** Sleutel van model, instellingen en tekst: dezelfde sleutel is dezelfde les. */
  sleutel: string;
  titel: string;
  track: TrackRef;
  les: Les;
  meta: { model: string; generatedAt: string; bedrag?: string; lyricsSource: string; partial: boolean };
  gemaakt?: string;
}

export type LesKop = Pick<LesRij, 'id' | 'titel' | 'track' | 'gemaakt'>;

const TABEL = 'lessen';

/**
 * Lessen in Supabase. Alleen wie ingelogd is ziet zijn eigen lessen; dat regelt de database
 * met row level security (zie supabase/schema.sql).
 */
export class Lessenbank {
  constructor(readonly sb: SupabaseClient) {}

  async email(): Promise<string | null> {
    const { data } = await this.sb.auth.getSession();
    return data.session?.user.email ?? null;
  }

  /** Stuurt een inloglink. Na het klikken komt de browser terug op `terug`. */
  async stuurLink(email: string, terug: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: terug } });
    if (error) throw new Error(`Inloglink sturen lukte niet: ${error.message}`);
  }

  async uitloggen(): Promise<void> {
    await this.sb.auth.signOut();
  }

  async lijst(): Promise<LesKop[]> {
    const { data, error } = await this.sb.from(TABEL).select('id,titel,track,gemaakt').order('gemaakt', { ascending: false });
    if (error) throw new Error(`Lessen ophalen lukte niet: ${error.message}`);
    return (data ?? []) as LesKop[];
  }

  async haal(id: string): Promise<LesRij | undefined> {
    const { data, error } = await this.sb.from(TABEL).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Les ophalen lukte niet: ${error.message}`);
    return (data ?? undefined) as LesRij | undefined;
  }

  async metSleutel(sleutel: string): Promise<LesRij | undefined> {
    const { data, error } = await this.sb.from(TABEL).select('*').eq('sleutel', sleutel).limit(1).maybeSingle();
    if (error) throw new Error(`Les opzoeken lukte niet: ${error.message}`);
    return (data ?? undefined) as LesRij | undefined;
  }

  async bewaar(rij: LesRij): Promise<void> {
    const { gemaakt: _, ...zonder } = rij;
    const { error } = await this.sb.from(TABEL).upsert(zonder, { onConflict: 'user_id,id' });
    if (error) throw new Error(`Les bewaren lukte niet: ${error.message}`);
  }

  async wis(id: string): Promise<void> {
    const { error } = await this.sb.from(TABEL).delete().eq('id', id);
    if (error) throw new Error(`Les wissen lukte niet: ${error.message}`);
  }
}

/** Zonder Supabase-gegevens is er geen bank; de app zegt dan wat er nog moet. */
export function maakBank(i: Pick<Instellingen, 'supabaseUrl' | 'supabaseKey'>): Lessenbank | null {
  if (!i.supabaseUrl || !i.supabaseKey) return null;
  // Impliciete flow: Supabase komt terug met #access_token. Spotify gebruikt ?code; zo zitten ze elkaar niet in de weg.
  const sb = createClient(i.supabaseUrl, i.supabaseKey, {
    auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return new Lessenbank(sb);
}
