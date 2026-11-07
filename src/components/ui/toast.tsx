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
      "fixed top-4 right-4 z-[100] flex max-h-screen w-full flex-col gap-2.5 p-4 sm:bottom-4 sm:right-4 sm:top-auto md:max-w-[400px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between gap-3.5 overflow-hidden rounded-[12px] border px-4 py-3.5 shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default:
          "bg-[#EAF6ED] border-[#C9E7D1] text-[#1E293B] dark:bg-emerald-950/90 dark:border-emerald-800/70 dark:text-emerald-50",
        success:
          "bg-[#EAF6ED] border-[#C9E7D1] text-[#1E293B] dark:bg-emerald-950/90 dark:border-emerald-800/70 dark:text-emerald-50",
        info:
          "bg-[#E6EFFC] border-[#C4D8F8] text-[#1E293B] dark:bg-blue-950/90 dark:border-blue-800/70 dark:text-blue-50",
        warning:
          "bg-[#FDF4E3] border-[#F2DFB6] text-[#1E293B] dark:bg-amber-950/90 dark:border-amber-800/70 dark:text-amber-50",
        destructive:
          "destructive group bg-[#FCECE9] border-[#F4CCC4] text-[#1E293B] dark:bg-rose-950/90 dark:border-rose-800/70 dark:text-rose-50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export type ToastVariant = NonNullable<VariantProps<typeof toastVariants>["variant"]>

export function ToastStatusIcon({ variant = "default" }: { variant?: ToastVariant | null }) {
  const resolved = variant || "default"

  if (resolved === "destructive") {
    return (
      <div className="h-7 w-7 rounded-full bg-[#E54D2E] text-white flex items-center justify-center shrink-0 shadow-2xs">
        <span className="text-[14px] font-bold leading-none">!</span>
      </div>
    )
  }

  if (resolved === "warning") {
    return (
      <div className="h-7 w-7 rounded-full bg-[#F59E0B] text-white flex items-center justify-center shrink-0 shadow-2xs">
        <span className="text-[14px] font-bold leading-none">!</span>
      </div>
    )
  }

  if (resolved === "info") {
    return (
      <div className="h-7 w-7 rounded-full bg-[#0066FF] text-white flex items-center justify-center shrink-0 shadow-2xs">
        <span className="text-[13px] font-bold font-serif italic leading-none">i</span>
      </div>
    )
  }

  return (
    <div className="h-7 w-7 rounded-full bg-[#2EB85C] text-white flex items-center justify-center shrink-0 shadow-2xs">
      <Check className="h-4 w-4 stroke-[2.75]" />
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
      "inline-flex h-7 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white/60 px-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close> & { showProgressRing?: boolean }
>(({ className, showProgressRing = true, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 opacity-100 transition-colors hover:text-slate-900 dark:hover:text-white focus:outline-none cursor-pointer",
      className
    )}
    toast-close=""
    {...props}
  >
    {showProgressRing && (
      <svg className="absolute inset-0 h-7 w-7 -rotate-90 pointer-events-none" viewBox="0 0 28 28">
        <circle
          cx="14"
          cy="14"
          r="11.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          className="opacity-15"
        />
        <circle
          cx="14"
          cy="14"
          r="11.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeDasharray="72.25"
          strokeDashoffset="18"
          strokeLinecap="round"
          className="opacity-65"
        />
      </svg>
    )}
    <X className="h-3.5 w-3.5 stroke-[2]" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-[13.5px] font-medium text-[#1E293B] dark:text-slate-100 leading-snug", className)}
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
    className={cn("text-[12px] text-slate-600 dark:text-slate-300 leading-snug mt-0.5", className)}
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
