export function parseOptionalPositiveIntegerArg(argv: string[], names: string[], label: string) {
  const argIndex = argv.findIndex((arg) => names.includes(arg));
  if (argIndex >= 0) {
    const value = argv[argIndex + 1];
    if (!value || Number.isNaN(Number(value)) || Number(value) <= 0) {
      throw new Error(`\`${label}\` must be followed by a positive integer.`);
    }
    return Number(value);
  }

  const prefixedArg = argv.find((arg) => names.some((name) => arg.startsWith(`${name}=`)));
  if (!prefixedArg) return undefined;

  const value = prefixedArg.split("=")[1];
  if (!value || Number.isNaN(Number(value)) || Number(value) <= 0) {
    throw new Error(`\`${label}\` must be a positive integer.`);
  }
  return Number(value);
}

export function parseOptionalStringArg(argv: string[], names: string[], label: string) {
  const argIndex = argv.findIndex((arg) => names.includes(arg));
  if (argIndex >= 0) {
    const value = argv[argIndex + 1]?.trim();
    if (!value) {
      throw new Error(`\`${label}\` must be followed by a value.`);
    }
    return value;
  }

  const prefixedArg = argv.find((arg) => names.some((name) => arg.startsWith(`${name}=`)));
  if (!prefixedArg) return undefined;

  const value = prefixedArg.split("=")[1]?.trim();
  if (!value) {
    throw new Error(`\`${label}\` must be a non-empty value.`);
  }
  return value;
}

export function hasFlag(argv: string[], names: string[]) {
  return names.some((name) => argv.includes(name));
}
