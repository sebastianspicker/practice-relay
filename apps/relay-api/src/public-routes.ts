/**
 * The externally supported HTTP operation registry.
 *
 * Route handlers own request/response behavior. This registry owns only the
 * public path and method surface so runtime dispatch and OpenAPI cannot drift.
 */
/** One externally reachable path template and the methods dispatched for it. */
export interface PublicRouteTemplate {
  readonly path: string;
  readonly methods: readonly string[];
  readonly pattern: RegExp;
  readonly concealMethodMismatch?: boolean;
}

const exact = (
  path: string,
  methods: readonly string[],
): PublicRouteTemplate => ({
  path,
  methods,
  pattern: new RegExp(`^${path}$`, "u"),
});

const templated = (
  path: string,
  methods: readonly string[],
  pattern: RegExp,
  concealMethodMismatch = false,
): PublicRouteTemplate => ({ path, methods, pattern, concealMethodMismatch });

export const PUBLIC_ROUTE_TEMPLATES: readonly PublicRouteTemplate[] = [
  exact("/health", ["GET"]),
  exact("/readyz", ["GET"]),
  exact("/metrics", ["GET"]),
  exact("/ops/backup", ["POST"]),
  exact("/ops/backups", ["GET"]),
  exact("/ops/restore", ["POST"]),
  exact("/ops/audit", ["GET"]),
  exact("/auth/login", ["POST"]),
  exact("/auth/users", ["GET"]),
  exact("/me", ["GET"]),
  exact("/demo/export", ["GET"]),
  exact("/lti/login", ["GET", "POST"]),
  exact("/lti/jwks", ["GET"]),
  exact("/lti/oauth/token", ["POST"]),
  exact("/lti/ags/scores", ["POST"]),
  exact("/lti/launch", ["POST"]),
  exact("/profiles", ["GET"]),
  exact("/work-records", ["GET", "POST"]),
  templated("/work-records/{id}", ["GET", "PATCH"], /^\/work-records\/[^/]+$/u),
  templated("/work-records/{id}/members", ["POST"], /^\/work-records\/[^/]+\/members$/u),
  templated("/work-records/{id}/versions", ["GET"], /^\/work-records\/[^/]+\/versions$/u),
  templated("/work-records/{id}/tracks", ["POST"], /^\/work-records\/[^/]+\/tracks$/u),
  templated("/work-records/{id}/takes", ["POST"], /^\/work-records\/[^/]+\/takes$/u),
  templated("/work-records/{id}/takes/{takeId}/media", ["POST"], /^\/work-records\/[^/]+\/takes\/[^/]+\/media$/u, true),
  templated("/work-records/{id}/preferred-take", ["PUT"], /^\/work-records\/[^/]+\/preferred-take$/u),
  templated("/work-records/{id}/regions", ["POST"], /^\/work-records\/[^/]+\/regions$/u),
  templated("/work-records/{id}/comments", ["POST"], /^\/work-records\/[^/]+\/comments$/u),
  templated("/work-records/{id}/comments/{commentId}/resolve", ["POST"], /^\/work-records\/[^/]+\/comments\/[^/]+\/resolve$/u),
  templated("/work-records/{id}/consent", ["POST"], /^\/work-records\/[^/]+\/consent$/u),
  templated("/work-records/{id}/submit", ["POST"], /^\/work-records\/[^/]+\/submit$/u),
  templated("/work-records/{id}/export", ["POST"], /^\/work-records\/[^/]+\/export$/u),
  templated("/work-records/{id}/share", ["POST"], /^\/work-records\/[^/]+\/share$/u),
  templated("/work-records/{id}/analysis", ["POST"], /^\/work-records\/[^/]+\/analysis$/u),
  templated("/work-records/{id}/mvei", ["POST"], /^\/work-records\/[^/]+\/mvei$/u),
  templated("/work-records/{id}/lti", ["POST"], /^\/work-records\/[^/]+\/lti$/u),
  templated("/work-records/{id}/interop", ["POST"], /^\/work-records\/[^/]+\/interop$/u),
  templated("/work-records/{id}/subjects", ["POST"], /^\/work-records\/[^/]+\/subjects$/u),
  templated("/work-records/{id}/artifacts", ["POST"], /^\/work-records\/[^/]+\/artifacts$/u),
  templated("/work-records/{id}/annotations", ["POST"], /^\/work-records\/[^/]+\/annotations$/u),
  templated("/work-records/{id}/policies", ["POST"], /^\/work-records\/[^/]+\/policies$/u),
  templated("/work-records/{id}/snapshots", ["POST"], /^\/work-records\/[^/]+\/snapshots$/u),
  templated("/work-records/{id}/exports", ["POST"], /^\/work-records\/[^/]+\/exports$/u),
  templated("/media/{storageKey}", ["GET"], /^\/media\/.+/u),
];

/** Find the public route template that accepts a concrete request pathname. */
export function publicRouteForPath(
  pathname: string,
): PublicRouteTemplate | undefined {
  return PUBLIC_ROUTE_TEMPLATES.find((route) => route.pattern.test(pathname));
}
