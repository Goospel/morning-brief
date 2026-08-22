export const TOPICS = [
  'economy', 'finance', 'realestate', 'policy',
  'tech', 'ai', 'career', 'health',
  'parenting', 'living', 'culture', 'world',
] as const;

export type Topic = (typeof TOPICS)[number];

export function isTopic(v: string): v is Topic {
  return (TOPICS as readonly string[]).includes(v);
}
