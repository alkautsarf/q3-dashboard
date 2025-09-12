// Basic validators and parsers; to be expanded per docs.
export function isPositiveNumber(input: string): boolean {
  const n = Number(input);
  return Number.isFinite(n) && n > 0;
}

export function parseRecipientLine(line: string) {
  // Expected format: addressOrENS=amount
  // TODO: implement ENS resolution + checksum validation
  const [lhs, rhs] = line.split("=");
  return { who: lhs?.trim() ?? "", amount: rhs?.trim() ?? "" };
}

