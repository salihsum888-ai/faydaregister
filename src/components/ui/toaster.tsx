"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProgressBar,
  ToastProvider,
  ToastStatusIcon,
  ToastTitle,
  ToastVariant,
  ToastViewport,
} from "@/components/ui/toast"

export function resolveToastVariant(
  variant?: ToastVariant | null,
  title?: React.ReactNode
): ToastVariant {
  if (variant && variant !== "default") return variant
  if (typeof title === "string") {
    const lower = title.toLowerCase()
    if (
      lower.includes("error") ||
      lower.includes("fail") ||
      lower.includes("purge") ||
      lower.includes("removed") ||
      lower.includes("revoked") ||
      lower.includes("offline") ||
      lower.includes("invalid") ||
      lower.includes("denied")
    ) {
      return "destructive"
    }
    if (
      lower.includes("warn") ||
      lower.includes("caution") ||
      lower.includes("pending") ||
      lower.includes("limit") ||
      lower.includes("duplicate")
    ) {
      return "warning"
    }
    if (
      lower.includes("info") ||
      lower.includes("sync") ||
      lower.includes("copied") ||
      lower.includes("notice") ||
      lower.includes("filtered") ||
      lower.includes("located") ||
      lower.includes("transmission")
    ) {
      return "info"
    }
  }
  return "success"
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={4500}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const resolvedVariant = resolveToastVariant(variant, title)
        return (
          <Toast key={id} variant={resolvedVariant} {...props}>
            {/* Top White Card (Exact Option A) */}
            <div className="flex w-full items-center justify-between gap-3.5 rounded-[8px] border border-slate-100 bg-white px-4 py-3.5 text-[#1E293B] shadow-[0_2px_10px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <ToastStatusIcon variant={resolvedVariant} />
                <div className="flex flex-col min-w-0 flex-1">
                  {title && <ToastTitle>{title}</ToastTitle>}
                  {description && <ToastDescription>{description}</ToastDescription>}
                </div>
              </div>
              {action}
              <ToastClose />
            </div>
            {/* Bottom Striped Progress Bar Track Directly Underneath (Exact Option A) */}
            <ToastProgressBar variant={resolvedVariant} durationMs={4500} />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
