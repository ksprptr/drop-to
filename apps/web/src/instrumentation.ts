/**
 * Logs every server-side error Next.js surfaces — Server Actions, RSC renders, route handlers.
 **/
// The standalone runner is otherwise silent: a failed Server Action or route handler leaves no
// trace in the container logs, which makes production incidents undiagnosable. This is the one
// place Next.js hands every server error to, so it is the place to record them.
export function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routeType: string; renderSource?: string },
): void {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);

  console.error(
    `[server-error] ${request.method} ${request.path} ` +
      `(${context.routerKind}/${context.routeType}${context.renderSource ? `/${context.renderSource}` : ''})\n` +
      message,
  );
}
