import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

/*
 * Password hashing.
 *
 * Split out of auth.ts, which is `server-only` and therefore unimportable from
 * a plain Node script — and the seed script has to hash a password. The
 * alternative was a second copy of this in scripts/, which is precisely the
 * mistake that left verify.ts checking tamper digests with an algorithm that
 * had drifted from the one guarding real indents. One implementation, imported
 * by everything that needs it.
 *
 * Nothing here touches a database, a cookie or a request, so there is no reason
 * for it to be server-only in the first place.
 *
 * scrypt from node:crypto rather than bcrypt or argon2: both of those are
 * native modules that must compile, which is a build failure waiting to happen
 * on a host we do not control. scrypt is a memory-hard KDF, ships with the
 * runtime, and needs no install step. Node's defaults put one hash at roughly
 * 100ms — expensive to guess against, imperceptible to sign in with.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Hash a password for storage.
 *
 * The salt is per-password and travels with the hash, so two people who choose
 * the same password still produce different rows, and a stolen table cannot be
 * attacked with one precomputed set.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(plain, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Check a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed or absent hash. An account
 * with no password is one nobody has signed into yet, which is a normal state
 * and not an error.
 */
export async function verifyPassword(
  plain: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) return false;

  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== KEY_LENGTH) return false;

  const actual = await scrypt(plain, Buffer.from(saltHex, 'hex'), KEY_LENGTH);

  // Constant time: `===` on the hex would leak how much of the hash matched
  // through how long it took to decide.
  return timingSafeEqual(actual, expected);
}

/**
 * The stored form of an email address.
 *
 * Lower-cased and trimmed, because a phone keyboard capitalises the first
 * letter and "Saurabh@artizia.co.in" has to reach the same account as the
 * address typed on the Users screen. Applied on the way in and on every lookup,
 * so the two cannot disagree.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
