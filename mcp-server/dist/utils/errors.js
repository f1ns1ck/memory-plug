/**
 * Typed error helpers. All errors thrown by the plugin are MemoryError so the
 * MCP layer can present clean, user-facing messages without leaking stack
 * traces or file contents.
 */
export class MemoryError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "MemoryError";
        this.code = code;
    }
}
export function notInitialized(path) {
    return new MemoryError("NOT_INITIALIZED", `No .change-memory found at ${path}. Run init_memory (or /memory-init) first.`);
}
export function pathOutsideRoot(target) {
    return new MemoryError("PATH_OUTSIDE_ROOT", `Refusing to access path outside the project root: ${target}`);
}
export function notFound(message) {
    return new MemoryError("NOT_FOUND", message);
}
export function invalidInput(message) {
    return new MemoryError("INVALID_INPUT", message);
}
export function toErrorMessage(err) {
    if (err instanceof MemoryError)
        return err.message;
    if (err instanceof Error)
        return err.message;
    return String(err);
}
//# sourceMappingURL=errors.js.map