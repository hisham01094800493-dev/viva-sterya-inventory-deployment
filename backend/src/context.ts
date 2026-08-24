import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "./schema.js";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext({ req, res }: CreateExpressContextOptions): Promise<TrpcContext> {
  const user = req.isAuthenticated?.() ? (req.user as User) : null;
  return { req, res, user };
}
