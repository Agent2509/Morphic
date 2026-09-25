export class MorphicError extends Error {
  constructor(
    message: string,
    public readonly code: string = "MORPHIC_ERROR"
  ) {
    super(message);
    this.name = "MorphicError";
  }
}

export function isMorphicError(value: unknown): value is MorphicError {
  return value instanceof MorphicError;
}
