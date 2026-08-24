import { createTRPCReact } from "@trpc/react-query";

// The API contract is deliberately resolved at runtime, keeping this frontend uploadable by itself.
export const trpc: any = createTRPCReact<any>();
