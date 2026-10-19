import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../lib/errors.js";

export const validateBody =
  <T>(schema: ZodType<T>): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
      const summary = details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join("; ");
      return next(new ValidationError(`Invalid request: ${summary}`, details));
    }
    req.body = result.data;
    next();
  };
