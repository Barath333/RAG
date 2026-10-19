import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError, NotFoundError, ValidationError } from "../lib/errors.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`No route for ${req.method} ${req.path}`));
};

/** Every error leaves the API in the same shape: { error: { code, message, details? } }. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Malformed JSON bodies from express.json()
  if (err?.type === "entity.parse.failed") err = new ValidationError("Request body is not valid JSON.");
  if (err?.type === "entity.too.large") err = new AppError(413, "payload_too_large", "Request body is too large.");

  if (err instanceof AppError) {
    req.log.warn({ code: err.code, status: err.status, reason: err.message }, "request rejected");
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err instanceof ValidationError && err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  req.log.error({ err }, "unhandled error");
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong. Check the server logs with the request id.", requestId: req.id } });
};
