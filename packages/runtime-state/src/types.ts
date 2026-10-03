/** Shared admission and single-use protocol state contracts. */

/** One pending LTI launch with its absolute expiry time. */
export interface PendingLtiLaunch {
  readonly nonce: string;
  readonly issuer: string;
  readonly audience: string;
  readonly deploymentId: string;
  readonly expiresAt: number;
}

/** Account, source, and bounds for one login attempt admission. */
export interface BeginLoginOptions {
  readonly account: string;
  readonly source: string;
  readonly accountLimit?: number;
  readonly sourceLimit?: number;
  readonly windowMs?: number;
}

/** Optional time and capacity controls for pending launch registration. */
export interface RegisterLtiLaunchOptions {
  readonly ttlMs?: number;
  readonly maxPending?: number;
  readonly now?: number;
}

/** Admission and single-use protocol state shared by API request handlers. */
export interface RuntimeState {
  /** Return an expiring attempt lease, or undefined when either bound is full. */
  beginLogin(options: BeginLoginOptions): Promise<string | undefined>;
  /** Complete exactly one lease; failures count against account and source windows. */
  /** null releases a completed lease without charging infrastructure rejection as a login failure. */
  finishLogin(attemptId: string, success: boolean | null): Promise<void>;
  registerLtiLaunch(
    state: string,
    launch: Omit<PendingLtiLaunch, "expiresAt">,
    options?: RegisterLtiLaunchOptions,
  ): Promise<PendingLtiLaunch>;
  /** Remove and return an unexpired launch exactly once. */
  consumeLtiLaunch(state: string, now?: number): Promise<PendingLtiLaunch | undefined>;
  checkHealth(): Promise<void>;
  close(): Promise<void>;
}

/** Tenant namespace selected by the runtime composition root. */
export interface RuntimeStateOptions {
  readonly tenantId?: string;
}
