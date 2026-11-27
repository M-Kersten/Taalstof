export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Hoe diep het model nadenkt voor het de les schrijft. Hoger is nauwkeuriger en kost meer tijd en geld. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];
export const DEFAULT_EFFORT: Effort = 'medium';

export function isEffort(x: unknown): x is Effort {
  return (EFFORTS as readonly unknown[]).includes(x);
}
