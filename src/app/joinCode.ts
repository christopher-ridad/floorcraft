/** Letters and digits that can't be mistaken for each other (no 0/o, 1/l/i). */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const LENGTH = 12;

/** Fills an array with random bytes, like `crypto.getRandomValues`. */
export type RandomBytes = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

/**
 * A join code for the team link, e.g. `k7mq-x2bn-p9ft`. With 31 characters and 12 places it
 * can't be guessed; it's grouped so it can be read out loud if needed.
 */
export function generateJoinCode(
  randomBytes: RandomBytes = (bytes) => crypto.getRandomValues(bytes),
): string {
  const bytes = randomBytes(new Uint8Array(LENGTH));
  const characters = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]);
  return [0, 4, 8].map((start) => characters.slice(start, start + 4).join('')).join('-');
}
