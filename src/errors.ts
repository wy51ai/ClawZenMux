/**
 * Typed Error Classes for ClawZenMux
 *
 * Provides structured errors for authentication and proxy failures.
 */

/**
 * Thrown when no ZenMux API key is configured.
 */
export class AuthenticationError extends Error {
  readonly code = "AUTHENTICATION_ERROR" as const;

  constructor(message?: string) {
    super(
      message ??
        "No ZenMux API key configured. Set ZENMUX_API_KEY env var or configure via plugin settings.",
    );
    this.name = "AuthenticationError";
  }
}

/**
 * Thrown when the API key is invalid (401 from ZenMux).
 */
export class InvalidApiKeyError extends Error {
  readonly code = "INVALID_API_KEY" as const;

  constructor() {
    super("Invalid ZenMux API key. Check your key at https://zenmux.ai/console/api-keys");
    this.name = "InvalidApiKeyError";
  }
}

/**
 * Type guard to check if an error is AuthenticationError.
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof Error && (error as AuthenticationError).code === "AUTHENTICATION_ERROR";
}

/**
 * Type guard to check if an error is InvalidApiKeyError.
 */
export function isInvalidApiKeyError(error: unknown): error is InvalidApiKeyError {
  return error instanceof Error && (error as InvalidApiKeyError).code === "INVALID_API_KEY";
}
