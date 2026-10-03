/**
 * Stable WorkRecord domain error identities.
 * Why: boundaries classify failures by a portable code, not by message text or
 * by class identity, which may differ between bundled and workspace copies.
 */

/** Code carried by every membership-authorization denial. */
export const WORK_RECORD_ROLE_DENIED = "WORK_RECORD_ROLE_DENIED";

/** Code carried by every rejected duplicate identity within or across records. */
export const WORK_RECORD_DUPLICATE = "WORK_RECORD_DUPLICATE";

/** An actor lacks the record membership or role a mutation requires. */
export class WorkRecordRoleDeniedError extends Error {
  readonly code = WORK_RECORD_ROLE_DENIED;

  constructor(message: string) {
    super(message);
    this.name = "WorkRecordRoleDeniedError";
  }
}

/** A record or record child identity already exists. */
export class WorkRecordDuplicateError extends Error {
  readonly code = WORK_RECORD_DUPLICATE;

  constructor(message: string) {
    super(message);
    this.name = "WorkRecordDuplicateError";
  }
}

function hasCode(err: unknown, code: string): boolean {
  return err instanceof Error && (err as { code?: unknown }).code === code;
}

/** Identify a role denial by its stable code. */
export function isWorkRecordRoleDenied(err: unknown): err is WorkRecordRoleDeniedError {
  return hasCode(err, WORK_RECORD_ROLE_DENIED);
}

/** Identify a duplicate identity by its stable code. */
export function isWorkRecordDuplicate(err: unknown): err is WorkRecordDuplicateError {
  return hasCode(err, WORK_RECORD_DUPLICATE);
}

/** Code carried by every client-attributable WorkRecord validation failure. */
export const WORK_RECORD_INVALID = "WORK_RECORD_INVALID";

/** A requested record, command, or transition violates a WorkRecord rule. */
export class WorkRecordValidationError extends Error {
  readonly code = WORK_RECORD_INVALID;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WorkRecordValidationError";
  }
}

/** Identify a WorkRecord validation failure by its stable code. */
export function isWorkRecordInvalid(err: unknown): err is WorkRecordValidationError {
  return hasCode(err, WORK_RECORD_INVALID);
}

/** Code carried when a consent, use-policy, or release decision denies an action. */
export const WORK_RECORD_POLICY_DENIED = "WORK_RECORD_POLICY_DENIED";

/** A use policy or release decision does not permit the requested export or share. */
export class WorkRecordPolicyDeniedError extends Error {
  readonly code = WORK_RECORD_POLICY_DENIED;

  constructor(message: string) {
    super(message);
    this.name = "WorkRecordPolicyDeniedError";
  }
}

/** Identify a policy denial by its stable code. */
export function isWorkRecordPolicyDenied(err: unknown): err is WorkRecordPolicyDeniedError {
  return hasCode(err, WORK_RECORD_POLICY_DENIED);
}

/** Domain rules throw plain Error (or RangeError for numeric bounds); other types signal defects. */
function isDomainRuleFailure(err: unknown): err is Error {
  if (!(err instanceof Error) || typeof (err as { code?: unknown }).code === "string") return false;
  return Object.getPrototypeOf(err) === Error.prototype || Object.getPrototypeOf(err) === RangeError.prototype;
}

/**
 * Run pure WorkRecord parsing or transition code and classify its rule
 * violations as validation errors. Coded errors, programming defects such as
 * TypeError, and non-Error throws pass through unchanged.
 */
export function asWorkRecordValidation<T>(operation: () => T): T {
  try {
    return operation();
  } catch (err) {
    if (!isDomainRuleFailure(err)) throw err;
    throw new WorkRecordValidationError(err.message, { cause: err });
  }
}
