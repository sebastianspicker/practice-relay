/**
 * Course-local authentication for Practice Relay alpha; not campus SSO.
 *
 * Dev seed users have fixed passwords only when configured-user strict mode is off.
 * Tokens are HMAC-signed Bearer tokens (no external IdP).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

/** Course-local identity record used only by the bounded Practice Relay auth service. */
export interface AuthUser {
  userId: string;
  displayName: string;
  defaultRole: "faculty" | "student" | "examiner" | "notator" | "admin";
  password: string;
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
    password: "teach",
  },
  {
    userId: "student-1",
    displayName: "Student Demo",
    defaultRole: "student",
    password: "learn",
  },
  {
    userId: "examiner-1",
    displayName: "Examiner Demo",
    defaultRole: "examiner",
    password: "jury",
  },
  {
    userId: "ops-1",
    displayName: "Lab Operations",
    defaultRole: "admin",
    password: "ops",
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

const PLACEHOLDER_PASSWORD_PATTERNS = [
  /^<(?:password|secret|change[-_ ]?me)>$/i,
  /^(?:change|replace|set)[-_ ]?(?:me|this|password|secret)?$/i,
  /^(?:your[-_ ]?)?(?:password|secret)$/i,
  /(?:placeholder|todo|replace|change[-_ ]?me)/i,
];

function placeholderPassword(password: string): boolean {
  return PLACEHOLDER_PASSWORD_PATTERNS.some((pattern) => pattern.test(password));
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

function configuredPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || placeholderPassword(value)) {
    throw new Error(
      "configured auth password must be at least 12 characters and non-placeholder",
    );
  }
  return value;
}

function configuredAuthUser(candidate: unknown, ids: Set<string>): AuthUser {
  const value = configuredAuthUserValue(candidate);
  return {
    userId: configuredAuthUserId(value.userId, ids),
    displayName: configuredDisplayName(value.displayName),
    defaultRole: configuredDefaultRole(value.defaultRole),
    password: configuredPassword(value.password),
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
    return readFileSync(file, "utf8");
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
  login: (userId: string, password: string) => AuthSession | null;
  verify: (token: string | undefined | null) => AuthSession | null;
  getUser: (userId: string) => AuthUser | undefined;
  listUsers: () => Omit<AuthUser, "password">[];
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

function equalText(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const ephemeralAuthSecret = randomBytes(32).toString("base64url");

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
    login(userId, password) {
      const u = byId.get(userId);
      const matches = equalText(u?.password ?? "invalid-login-password", password);
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
      return configuredUsers.map(({ password: _p, ...rest }) => rest);
    },
  };
}
