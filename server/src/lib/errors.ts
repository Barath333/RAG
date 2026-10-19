/** Errors that are safe to show to the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly details?: unknown) {
    super(400, "validation_error", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, "not_found", message);
  }
}

/** The request was well-formed but the content can't be used (e.g. URL with no readable text). */
export class UnprocessableError extends AppError {
  constructor(message: string) {
    super(422, "unprocessable_content", message);
  }
}

/** An upstream dependency (OpenAI, a remote website) failed. */
export class UpstreamError extends AppError {
  constructor(message: string) {
    super(502, "upstream_error", message);
  }
}
