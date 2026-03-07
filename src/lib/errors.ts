// Fine-grained exit codes (F7)
export const EXIT_SUCCESS = 0;
export const EXIT_ERROR = 1;
export const EXIT_AUTH = 2;
export const EXIT_RATE_LIMIT = 3;
export const EXIT_PLAN_LIMIT = 4;
export const EXIT_NOT_FOUND = 5;
export const EXIT_VALIDATION = 6;

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = EXIT_ERROR
  ) {
    super(message);
    this.name = "CliError";
  }
}

export class AuthError extends CliError {
  constructor(message: string = "Not authenticated. Run `anonli login` first.") {
    super(message, EXIT_AUTH);
    this.name = "AuthError";
  }
}

export class ApiError extends CliError {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    code?: string,
    requestId?: string
  ) {
    const exitCode =
      statusCode === 404 ? EXIT_NOT_FOUND :
      statusCode === 429 ? EXIT_RATE_LIMIT :
      statusCode === 402 || statusCode === 403 ? EXIT_PLAN_LIMIT :
      EXIT_ERROR;
    super(message, exitCode);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.requestId = requestId;
  }
}

export class RateLimitError extends ApiError {
  constructor(
    message: string,
    public readonly resetAt: Date
  ) {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

export class PlanLimitError extends CliError {
  constructor(message: string, public readonly suggestion: string) {
    super(message, EXIT_PLAN_LIMIT);
    this.name = "PlanLimitError";
  }
}

export class ValidationError extends CliError {
  constructor(message: string) {
    super(message, EXIT_VALIDATION);
    this.name = "ValidationError";
  }
}
