import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { getUserPermissionSettings } from "../db";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const roleProcedure = (...roles: string[]) => t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    if (!roles.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية لتنفيذ هذا الإجراء" });
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const permissionProcedure = (screen: string) => protectedProcedure.use(async opts => {
  const permissions = await getUserPermissionSettings(opts.ctx.user.id, opts.ctx.user.role);
  if (!permissions.allowedScreens.includes(screen)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى هذه الشاشة" });
  return opts.next({ ctx: { ...opts.ctx, permissions } });
});

export const reportPermissionProcedure = (report: string) => protectedProcedure.use(async opts => {
  const permissions = await getUserPermissionSettings(opts.ctx.user.id, opts.ctx.user.role);
  if (!permissions.allowedReports.includes(report)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى هذا التقرير" });
  return opts.next({ ctx: { ...opts.ctx, permissions } });
});

export const adminProcedure = roleProcedure("admin");
export const managementProcedure = roleProcedure("admin", "manager");
export const entryProcedure = roleProcedure("admin", "manager", "operator", "user");
export const reviewProcedure = roleProcedure("admin", "manager", "reviewer", "reports");
