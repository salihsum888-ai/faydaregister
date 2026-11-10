"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X, Check } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-4 right-4 z-[100] flex max-h-screen w-full flex-col gap-3 p-4 sm:bottom-4 sm:right-4 sm:top-auto md:max-w-[390px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full flex-col gap-[3px] bg-transparent transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "",
        success: "",
        info: "",
        warning: "",
        destructive: "destructive group",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export type ToastVariant = NonNullable<VariantProps<typeof toastVariants>["variant"]>

export function getOptionAStripeStyle(variant?: ToastVariant | null): React.CSSProperties {
  const resolved = variant || "default"
  if (resolved === "destructive") {
    return {
      backgroundColor: "#E54D2E",
      backgroundImage:
        "repeating-linear-gradient(-45deg, #D93D1E 0px, #D93D1E 4px, #F3684B 4px, #F3684B 8px)",
    }
  }
  if (resolved === "warning") {
    return {
      backgroundColor: "#F59E0B",
      backgroundImage:
        "repeating-linear-gradient(-45deg, #E58E00 0px, #E58E00 4px, #FBB43B 4px, #FBB43B 8px)",
    }
  }
  if (resolved === "info") {
    return {
      backgroundColor: "#0066FF",
      backgroundImage:
        "repeating-linear-gradient(-45deg, #0058DB 0px, #0058DB 4px, #2E85FF 4px, #2E85FF 8px)",
    }
  }
  return {
    backgroundColor: "#2EB85C",
    backgroundImage:
      "repeating-linear-gradient(-45deg, #25A24E 0px, #25A24E 4px, #44CC70 4px, #44CC70 8px)",
  }
}

export function ToastStatusIcon({ variant = "default" }: { variant?: ToastVariant | null }) {
  const resolved = variant || "default"

  if (resolved === "destructive") {
    return (
      <div
        className="h-7 w-7 rounded-full text-white flex items-center justify-center shrink-0"
        style={{ backgroundColor: "#E54D2E" }}
      >
        <span className="text-[14px] font-bold font-sans leading-none">!</span>
      </div>
    )
  }

  if (resolved === "warning") {
    return (
      <div
        className="h-7 w-7 rounded-full text-white flex items-center justify-center shrink-0"
        style={{ backgroundColor: "#F59E0B" }}
      >
        <span className="text-[14px] font-bold font-sans leading-none">!</span>
      </div>
    )
  }

  if (resolved === "info") {
    return (
      <div
        className="h-7 w-7 rounded-full text-white flex items-center justify-center shrink-0"
        style={{ backgroundColor: "#0066FF" }}
      >
        <span className="text-[13px] font-bold font-sans leading-none">i</span>
      </div>
    )
  }

  return (
    <div
      className="h-7 w-7 rounded-full text-white flex items-center justify-center shrink-0"
      style={{ backgroundColor: "#2EB85C" }}
    >
      <Check className="h-4 w-4 stroke-[2.75] text-white" />
    </div>
  )
}

export function ToastProgressBar({
  variant = "default",
  durationMs = 4500,
  staticPercent,
}: {
  variant?: ToastVariant | null
  durationMs?: number
  staticPercent?: number
}) {
  const resolved = variant || "default"
  const defaultPct =
    resolved === "info"
      ? 42
      : resolved === "destructive"
      ? 42
      : resolved === "warning"
      ? 36
      : 30

  const [progressPct, setProgressPct] = React.useState(
    typeof staticPercent === "number" ? staticPercent : 48
  )

  React.useEffect(() => {
    if (typeof staticPercent === "number") {
      setProgressPct(staticPercent)
      return
    }
    const startTimer = setTimeout(() => {
      setProgressPct(defaultPct)
    }, 50)
    return () => clearTimeout(startTimer)
  }, [staticPercent, defaultPct])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none h-[5px] w-full rounded-full bg-[#E5E7EB] dark:bg-slate-800 overflow-hidden"
    >
      <div
        className="h-full rounded-full transition-[width] ease-out"
        style={{
          ...getOptionAStripeStyle(resolved),
          width: `${progressPct}%`,
          transitionDuration: typeof staticPercent === "number" ? "300ms" : `${durationMs}ms`,
        }}
      />
    </div>
  )
}

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:outline-none disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "inline-flex h-6 w-6 shrink-0 items-center justify-center text-[#334155] dark:text-slate-400 opacity-100 transition-colors hover:text-slate-950 dark:hover:text-white focus:outline-none cursor-pointer",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4 stroke-[1.75]" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn(
      "text-[13.5px] font-medium text-[#1E293B] dark:text-slate-100 leading-snug",
      className
    )}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn(
      "text-[12px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5",
      className
    )}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
