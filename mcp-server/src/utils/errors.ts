/**
 * Typed error helpers. All errors thrown by the plugin are MemoryError so the
 * MCP layer can present clean, user-facing messages without leaking stack
 * traces or file contents.
 */
export class MemoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MemoryError";
    this.code = code;
  }
}

export function notInitialized(path: string): MemoryError {
  return new MemoryError(
    "NOT_INITIALIZED",
    `No .change-memory found at ${path}. Run init_memory (or /memory-init) first.`,
  );
}

export function pathOutsideRoot(target: string): MemoryError {
  return new MemoryError(
    "PATH_OUTSIDE_ROOT",
    `Refusing to access path outside the project root: ${target}`,
  );
}

export function notFound(message: string): MemoryError {
  return new MemoryError("NOT_FOUND", message);
}

export function invalidInput(message: string): MemoryError {
  return new MemoryError("INVALID_INPUT", message);
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof MemoryError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
