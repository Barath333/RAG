import { z } from "zod";

export const MAX_QUESTION_CHARS = 1000;

export const ingestSchema = (maxNoteChars: number) =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("note"),
      text: z.string().trim().min(1, "text must not be empty").max(maxNoteChars, `text must be at most ${maxNoteChars} characters`),
      title: z.string().trim().max(120).optional(),
    }),
    z.object({
      type: z.literal("url"),
      url: z.string().trim().min(1, "url must not be empty").max(2048),
    }),
  ]);

export const querySchema = z.object({
  question: z.string().trim().min(1, "question must not be empty").max(MAX_QUESTION_CHARS),
  topK: z.number().int().min(1).max(10).optional(),
});

export type IngestBody = z.infer<ReturnType<typeof ingestSchema>>;
export type QueryBody = z.infer<typeof querySchema>;
