import type { Context } from "hono";
import type { z } from "zod";

export class ValidationError extends Error {
  constructor(public readonly issues: { path: string; message: string }[]) {
    super("Invalid request");
    this.name = "ValidationError";
  }
}

/** Parses the JSON body against a schema. Throws ValidationError (handled app-wide as 400). */
export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ValidationError([{ path: "", message: "Body must be valid JSON" }]);
  }
  return parse(raw, schema);
}

/** Parses route params (or any object) against a schema. */
export function parse<T extends z.ZodType>(value: unknown, schema: T): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    );
  }
  return result.data;
}
