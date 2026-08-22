export const TOPICS = [
  'economy', 'finance', 'realestate', 'policy',
  'tech', 'ai', 'career', 'health',
  'parenting', 'living', 'culture', 'sports',
  'world',
] as const;

export type Topic = (typeof TOPICS)[number];

export function isTopic(v: string): v is Topic {
  return (TOPICS as readonly string[]).includes(v);
}

export const JOB_FIELDS = [
  'it', 'finance', 'medical', 'edu',
  'public', 'manufacturing', 'service', 'etc',
] as const;

export type JobField = (typeof JOB_FIELDS)[number];

export function isJobField(v: string): v is JobField {
  return (JOB_FIELDS as readonly string[]).includes(v);
}

export const HOUSEHOLDS = ['single', 'married', 'with_kids'] as const;

export type Household = (typeof HOUSEHOLDS)[number];

export function isHousehold(v: string): v is Household {
  return (HOUSEHOLDS as readonly string[]).includes(v);
}
