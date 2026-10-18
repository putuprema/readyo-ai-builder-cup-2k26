// The number check (specs/06-agent.md, "Cards"): the model never states a number that is not
// in the data passed to it. Every digit run in a text is parsed to a value and must match a
// value parsed from the facts the model was given. Strict on purpose: "Rp 12.4 m" may not
// become "Rp 12,400,000", and "31%" may not become "0.31", because the reader cannot tell a
// conversion from an invention.

const NUMBER_TOKEN = /\d+(?:[.,]\d+)*/g;

/** Every number in a text, as its canonical value string ("12.4", "1350000"). */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const value = parseNumberToken(match[0]);
    if (value !== null) out.push(value);
  }
  return out;
}

/**
 * "12.4" → "12.4"; "1.350.000" and "1,350,000" → "1350000"; "1,5" → "1.5". A single separator
 * followed by one or two digits is a decimal mark; anything else groups thousands.
 */
export function parseNumberToken(token: string): string | null {
  const parts = token.split(/[.,]/);
  let text: string;
  if (parts.length === 1) {
    text = token;
  } else if (parts.length === 2 && (parts[1]?.length ?? 0) <= 2) {
    text = `${parts[0]}.${parts[1]}`;
  } else {
    text = parts.join("");
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return String(value);
}

export interface NumberCheck {
  ok: boolean;
  /** Numbers in the text that are not in the facts, as written in the text. */
  offending: string[];
}

/** Check a text against the facts it was written from. */
export function checkNumbers(text: string, facts: Iterable<string>): NumberCheck {
  const allowed = new Set<string>();
  for (const fact of facts) for (const n of numbersIn(fact)) allowed.add(n);
  const offending: string[] = [];
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const value = parseNumberToken(match[0]);
    if (value !== null && !allowed.has(value) && !offending.includes(match[0])) {
      offending.push(match[0]);
    }
  }
  return { ok: offending.length === 0, offending };
}
