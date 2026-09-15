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

export function canAccessWarehouses(allowedWarehouseIds: number[], warehouseIds: Array<number | null | undefined>) {
  if (!allowedWarehouseIds.length) return true;
  const ids = warehouseIds.filter((id): id is number => typeof id === "number");
  return ids.length > 0 && ids.every(id => allowedWarehouseIds.includes(id));
}

const roleProcedure = (...roles: string[]) => t.procedure.use(
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
export const entryProcedure = roleProcedure("admin", "manager", "operator", "user").use(async opts => {
  const permissions = await getUserPermissionSettings(opts.ctx.user.id, opts.ctx.user.role);
  if (permissions.readOnly) throw new TRPCError({ code: "FORBIDDEN", message: "حسابك للقراءة فقط ولا يمكنه تعديل بيانات المخزون" });
  return opts.next({ ctx: { ...opts.ctx, permissions } });
});
export const writePermissionProcedure = (screen: string) => permissionProcedure(screen).use(async opts => {
  if (opts.ctx.permissions.readOnly) throw new TRPCError({ code: "FORBIDDEN", message: "حسابك للقراءة فقط ولا يمكنه تعديل بيانات المخزون" });
  return opts.next({ ctx: opts.ctx });
});
export const itemCreateProcedure = permissionProcedure("inventory").use(async opts => {
  if (opts.ctx.permissions.readOnly || opts.ctx.permissions.allowedReports.includes("item-create-disabled")) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية إضافة أصناف جديدة" });
  return opts.next({ ctx: opts.ctx });
});
export const reviewProcedure = roleProcedure("admin", "manager", "reviewer", "reports");
