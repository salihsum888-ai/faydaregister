"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastStatusIcon,
  ToastTitle,
  ToastVariant,
  ToastViewport,
} from "@/components/ui/toast"

function resolveToastVariant(
  variant?: ToastVariant | null,
  title?: React.ReactNode
): ToastVariant {
  if (variant && variant !== "default") return variant
  if (typeof title === "string") {
    const lower = title.toLowerCase()
    if (lower.includes("error") || lower.includes("fail") || lower.includes("purge") || lower.includes("removed") || lower.includes("revoked") || lower.includes("offline")) {
      return "destructive"
    }
    if (lower.includes("warn") || lower.includes("caution") || lower.includes("pending") || lower.includes("limit")) {
      return "warning"
    }
    if (lower.includes("info") || lower.includes("sync") || lower.includes("copied") || lower.includes("notice")) {
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
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <ToastStatusIcon variant={resolvedVariant} />
              <div className="flex flex-col min-w-0 flex-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose showProgressRing={resolvedVariant === "success"} />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
