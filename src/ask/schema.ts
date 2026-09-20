/**
 * Schemas for the ask surface. Both boundaries are validated here: the request coming
 * off the public internet, and the model's JSON going out to a reader.
 *
 * A model's JSON is untrusted input like any other. `AskAnswer` is what the API is told
 * to emit AND what its reply is re-parsed against, so a shape that slips past the
 * server-side format still cannot reach the page.
 */
import { z } from 'zod';

export const AskRequest = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lens: z.string().max(40).optional(),
  ai: z.string().max(40).optional(),
  question: z.string().trim().min(4).max(300),
});
export type AskRequest = z.infer<typeof AskRequest>;

export const AskAnswer = z.object({
  /** False when the facts given do not cover the question. Honesty is in the schema. */
  answerable: z.boolean(),
  answer: z.string().min(1).max(700),
  /** 1-based indexes of the fact lines the answer rests on. Verified against the block. */
  usedFacts: z.array(z.number().int().min(1).max(200)).min(1).max(6),
});
export type AskAnswer = z.infer<typeof AskAnswer>;
