import { getActiveProjectForUser } from "./db";

/**
 * The project a request is currently operating inside.
 *
 * `projectId === null` means "no scoping" — this is the graceful-degradation
 * path used when the projects layer is not available yet (table missing) or the
 * user has no project assigned. In that case queries behave exactly as they did
 * before the projects feature existed, which keeps old deployments working.
 */
export type ProjectScope = {
  projectId: number | null;
  projectCode: string | null;
  projectName: string | null;
};

const UNSCOPED: ProjectScope = {
  projectId: null,
  projectCode: null,
  projectName: null,
};

/**
 * Resolves the active project for a user.
 *
 * Never throws: a failure to read the projects layer must not break inventory
 * reads, so any error degrades to "unscoped".
 */
export async function resolveProjectScope(
  userId: number,
  role: string
): Promise<ProjectScope> {
  try {
    const project = await getActiveProjectForUser(userId, role);
    if (!project) return UNSCOPED;
    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
    };
  } catch {
    return UNSCOPED;
  }
}

/**
 * Resolves the project scope for a request context, reusing an already-loaded
 * scope when one was attached by a middleware.
 */
export async function projectScopeFor(ctx: {
  user: { id: number; role: string };
  projectScope?: ProjectScope;
}): Promise<ProjectScope> {
  if (ctx.projectScope) return ctx.projectScope;
  return resolveProjectScope(ctx.user.id, ctx.user.role);
}
