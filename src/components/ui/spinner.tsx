import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 text-warm-amber/60 animate-spin", className)}
      {...props}
    />
  )
}

function SpinnerDot({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("size-1.5 rounded-full bg-warm-amber/50 animate-pulse", className)}
      {...props}
    />
  )
}

export { Spinner, SpinnerDot }
