import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("smart-skeleton bg-accent rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
