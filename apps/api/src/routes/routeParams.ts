type ParseError = {
  status: number;
  message: string;
};

type ParseResult<T> =
  | { value: T; error?: undefined }
  | { value?: undefined; error: ParseError };

function toPositiveInteger(value: string | number | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseRequiredPositiveInt(
  value: string | number | undefined,
  label: string,
): ParseResult<number> {
  const parsed = toPositiveInteger(value);
  if (parsed === null) {
    return { error: { status: 400, message: `${label} must be a positive integer` } };
  }
  return { value: parsed };
}

export function parseOptionalPositiveInt(
  value: string | number | undefined,
  label: string,
): ParseResult<number | undefined> {
  if (value === undefined) {
    return { value: undefined };
  }

  const parsed = toPositiveInteger(value);
  if (parsed === null) {
    return { error: { status: 400, message: `${label} must be a positive integer when provided` } };
  }
  return { value: parsed };
}

export function parseEnumValue<const T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  _label: string,
  message: string,
): ParseResult<T> {
  if (value && allowed.includes(value as T)) {
    return { value: value as T };
  }
  return { error: { status: 400, message } };
}
