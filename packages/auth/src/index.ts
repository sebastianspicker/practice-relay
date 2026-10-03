/**
 * Course-local authentication for Practice Relay alpha; not campus SSO.
 *
 * Dev seed users have fixed passwords only when configured-user strict mode is off.
 * Tokens are HMAC-signed Bearer tokens (no external IdP).
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export { AuthenticationBusyError } from "./password-derivation.ts";
import { derivePasswordKeyAsync } from "./password-derivation.ts";
import { readPrivateRegularFile } from "./private-file.js";

/** Course-local identity record used only by the bounded Practice Relay auth service. */
export interface AuthUser {
  userId: string;
  displayName: string;
  defaultRole: "faculty" | "student" | "examiner" | "notator" | "admin";
  passwordHash: string;
}

/** Signed session projection that never exposes the user password. */
export interface AuthSession {
  token: string;
  userId: string;
  displayName: string;
  defaultRole: AuthUser["defaultRole"];
  expiresAt: string;
}

export const SEED_USERS: AuthUser[] = [
  {
    userId: "teacher-1",
    displayName: "Faculty Demo",
    defaultRole: "faculty",
    passwordHash: "scrypt-v1$16384$8$1$c2VlZC10ZWFjaC12MS0wMDE$UdVgJbH99zchI60p7IvjFE53lL6ui_5RFVC4EXLL3J4",
  },
  {
    userId: "student-1",
    displayName: "Student Demo",
    defaultRole: "student",
    passwordHash: "scrypt-v1$16384$8$1$c2VlZC1sZWFybi12MS0wMDE$KcI5kXrE1xzyBC-IonyQnh-430NB3FQHKvCjlmqjDHw",
  },
  {
    userId: "examiner-1",
    displayName: "Examiner Demo",
    defaultRole: "examiner",
    passwordHash: "scrypt-v1$16384$8$1$c2VlZC1qdXJ5LXYxLS0wMDE$S8J00O0jKJiu9kUOmGSTGTEd1oQ6tLCod-bsiMovv_U",
  },
  {
    userId: "ops-1",
    displayName: "Lab Operations",
    defaultRole: "admin",
    passwordHash: "scrypt-v1$16384$8$1$c2VlZC1vcHMtdjEtLS0tMDAx$SDPGfWiRRz4E_frpYF7gA4L2x-W2bRySyrs_VPdzd3A",
  },
];

const AUTH_USER_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const AUTH_ROLES: ReadonlySet<AuthUser["defaultRole"]> = new Set([
  "faculty",
  "student",
  "examiner",
  "notator",
  "admin",
]);

/** Options for loading lab users from an injected process environment. */
export interface AuthUserLoadOptions {
  env?: NodeJS.ProcessEnv;
  /** Reject missing configuration rather than falling back to demo users. */
  requireConfigured?: boolean;
}

function configuredAuthUserValue(candidate: unknown): Record<string, unknown> {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("configured auth users must contain objects");
  }
  return candidate as Record<string, unknown>;
}

function configuredAuthUserId(value: unknown, ids: Set<string>): string {
  if (typeof value !== "string" || !AUTH_USER_ID.test(value)) {
    throw new Error("configured auth userId must be a safe unique identifier");
  }
  if (ids.has(value)) {
    throw new Error("configured auth userIds must be unique");
  }
  ids.add(value);
  return value;
}

function configuredDisplayName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 256) {
    throw new Error("configured auth displayName must be non-empty");
  }
  return value.trim();
}

function configuredDefaultRole(value: unknown): AuthUser["defaultRole"] {
  if (typeof value !== "string" || !AUTH_ROLES.has(value as AuthUser["defaultRole"])) {
    throw new Error("configured auth defaultRole is not supported");
  }
  return value as AuthUser["defaultRole"];
}

const SCRYPT_VERSION = "scrypt-v1";
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_BYTES = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function derivePasswordKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY,
  });
}

/** Create the versioned scrypt value required by configured auth-user files. */
export function createScryptPasswordHash(password: string, salt = randomBytes(16)): string {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("auth password must be a non-empty string");
  }
  return [
    SCRYPT_VERSION,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derivePasswordKey(password, salt).toString("base64url"),
  ].join("$");
}

function parseScryptPasswordHash(value: unknown): { salt: Buffer; key: Buffer } | undefined {
  if (typeof value !== "string") return undefined;
  const [version, n, r, p, saltText, keyText, extra] = value.split("$");
  if (
    version !== SCRYPT_VERSION ||
    n !== String(SCRYPT_N) ||
    r !== String(SCRYPT_R) ||
    p !== String(SCRYPT_P) ||
    extra !== undefined ||
    !saltText ||
    !keyText ||
    !BASE64URL.test(saltText) ||
    !BASE64URL.test(keyText)
  ) return undefined;
  const salt = Buffer.from(saltText, "base64url");
  const key = Buffer.from(keyText, "base64url");
  return salt.length >= 16 && key.length === SCRYPT_KEY_BYTES ? { salt, key } : undefined;
}

function configuredPasswordHash(value: Record<string, unknown>): string {
  if (value.password !== undefined) {
    throw new Error(
      "configured auth users must replace plaintext password with passwordHash (scrypt-v1)",
    );
  }
  if (!parseScryptPasswordHash(value.passwordHash)) {
    throw new Error("configured auth passwordHash must use scrypt-v1");
  }
  return value.passwordHash as string;
}

async function verifyPasswordHash(password: string, hash: string): Promise<boolean> {
  const parsed = parseScryptPasswordHash(hash);
  if (!parsed) return false;
  const candidate = await derivePasswordKeyAsync(password, parsed.salt);
  return timingSafeEqual(candidate, parsed.key);
}

function configuredAuthUser(candidate: unknown, ids: Set<string>): AuthUser {
  const value = configuredAuthUserValue(candidate);
  return {
    userId: configuredAuthUserId(value.userId, ids),
    displayName: configuredDisplayName(value.displayName),
    defaultRole: configuredDefaultRole(value.defaultRole),
    passwordHash: configuredPasswordHash(value),
  };
}

function validateConfiguredUsers(input: unknown): AuthUser[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("configured auth users must be a non-empty array");
  }
  const ids = new Set<string>();
  return input.map((candidate) => configuredAuthUser(candidate, ids));
}

function resolveConfiguredAuthUsersRaw(env: NodeJS.ProcessEnv): string | undefined {
  const file = env.PRACTICE_RELAY_AUTH_USERS_FILE?.trim();
  const json = env.PRACTICE_RELAY_AUTH_USERS_JSON?.trim();
  if (!file) return json;
  try {
    return readPrivateRegularFile(file);
  } catch {
    throw new Error("configured auth users file could not be read");
  }
}

/**
 * Load configured course users from a file or JSON environment value.
 * File configuration takes precedence. Strict mode never permits demo users.
 */
export function loadConfiguredAuthUsers(
  options: AuthUserLoadOptions = {},
): AuthUser[] {
  const env = options.env ?? process.env;
  const requireConfigured =
    options.requireConfigured ?? env.PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS === "1";
  const raw = resolveConfiguredAuthUsersRaw(env);

  if (!raw || !raw.trim()) {
    if (requireConfigured) throw new Error("configured auth users are required");
    return SEED_USERS;
  }

  try {
    return validateConfiguredUsers(JSON.parse(raw));
  } catch (error) {
    if (!requireConfigured) throw error;
    throw error instanceof Error
      ? new Error(`configured auth users rejected: ${error.message}`)
      : new Error("configured auth users rejected");
  }
}

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

/** Narrow course-local authentication contract used by API route boundaries. */
export interface AuthService {
  login: (userId: string, password: string) => Promise<AuthSession | null>;
  verify: (token: string | undefined | null) => AuthSession | null;
  getUser: (userId: string) => AuthUser | undefined;
  listUsers: () => Omit<AuthUser, "passwordHash">[];
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payloadB64).digest());
}

const ephemeralAuthSecret = randomBytes(32).toString("base64url");
const invalidLoginPasswordHash = createScryptPasswordHash("invalid-login-password");

/**
 * Create course-local auth service.
 * @param secret HMAC secret (use PRACTICE_RELAY_AUTH_SECRET in production labs)
 */
export function createAuthService(
  secret = process.env.PRACTICE_RELAY_AUTH_SECRET ?? ephemeralAuthSecret,
  users?: AuthUser[],
): AuthService {
  const configuredUsers = users ?? loadConfiguredAuthUsers();
  const byId = new Map(configuredUsers.map((u) => [u.userId, u]));

  return {
    async login(userId, password) {
      const u = byId.get(userId);
      const matches = await verifyPasswordHash(password, u?.passwordHash ?? invalidLoginPasswordHash);
      if (!u || !matches) return null;
      const exp = Date.now() + DEFAULT_TTL_MS;
      const body = {
        sub: u.userId,
        name: u.displayName,
        role: u.defaultRole,
        exp,
        nonce: randomBytes(8).toString("hex"),
      };
      const payloadB64 = b64url(JSON.stringify(body));
      const sig = sign(payloadB64, secret);
      const token = `${payloadB64}.${sig}`;
      return {
        token,
        userId: u.userId,
        displayName: u.displayName,
        defaultRole: u.defaultRole,
        expiresAt: new Date(exp).toISOString(),
      };
    },
    verify(token) {
      if (!token || typeof token !== "string") return null;
      const raw = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();
      const parts = raw.split(".");
      if (parts.length !== 2) return null;
      const [payloadB64, sig] = parts;
      if (!payloadB64 || !sig) return null;
      const expected = sign(payloadB64, secret);
      try {
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
      } catch {
        return null;
      }
      let body: {
        sub: string;
        name: string;
        role: AuthUser["defaultRole"];
        exp: number;
      };
      try {
        const json = Buffer.from(
          payloadB64.replace(/-/g, "+").replace(/_/g, "/"),
          "base64",
        ).toString("utf8");
        body = JSON.parse(json);
      } catch {
        return null;
      }
      const user = byId.get(body.sub);
      if (
        !user ||
        !Number.isFinite(body.exp) ||
        Date.now() > body.exp ||
        body.name !== user.displayName ||
        body.role !== user.defaultRole
      ) {
        return null;
      }
      return {
        token: raw,
        userId: body.sub,
        displayName: body.name,
        defaultRole: body.role,
        expiresAt: new Date(body.exp).toISOString(),
      };
    },
    getUser(userId) {
      return byId.get(userId);
    },
    listUsers() {
      return configuredUsers.map(({ passwordHash: _p, ...rest }) => rest);
    },
  };
}
