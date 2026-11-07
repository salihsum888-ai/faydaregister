'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Fingerprint,
  Lock,
  XCircle,
  Loader2,
  RotateCcw,
} from 'lucide-react';

export type VerificationVariant = 'credentials' | 'mfa' | 'provisioned' | 'session';
export type VerificationOutcome = 'verifying' | 'success' | 'wrong';

interface VerificationAnimationProps {
  variant?: VerificationVariant;
  outcome?: VerificationOutcome;
  title?: string;
  subtitle?: string;
  errorMessage?: string;
  userName?: string;
  userRole?: string;
  statusLabel?: string;
  durationMs?: number;
  compact?: boolean;
  onRetry?: () => void;
}

export function VerificationAnimation({
  variant = 'mfa',
  outcome = 'success',
  title,
  subtitle,
  errorMessage,
  userName,
  userRole,
  statusLabel,
  durationMs = 1500,
  compact = false,
  onRetry,
}: VerificationAnimationProps) {
  const [step, setStep] = useState<'verifying' | 'success' | 'wrong'>(
    outcome === 'verifying' ? 'verifying' : 'verifying'
  );
  const [progress, setProgress] = useState(20);

  useEffect(() => {
    if (outcome === 'verifying') {
      setStep('verifying');
      setProgress(55);
      return;
    }

    // Start in verifying state briefly, then transition to final outcome (success or wrong)
    setStep('verifying');
    setProgress(45);

    const scanTimer = setTimeout(() => {
      setStep(outcome);
      setProgress(100);
    }, Math.min(450, durationMs * 0.32));

    return () => clearTimeout(scanTimer);
  }, [outcome, durationMs]);

  const defaultCopy: Record<
    VerificationVariant,
    {
      verifyingHeading: string;
      verifyingSub: string;
      verifyingTag: string;
      successHeading: string;
      successSub: string;
      successTag: string;
      wrongHeading: string;
      wrongSub: string;
      wrongTag: string;
    }
  > = {
    credentials: {
      verifyingHeading: 'Verifying Credentials...',
      verifyingSub: 'Checking official email and encrypted access key against bureau directory...',
      verifyingTag: 'STAGE 01 · VERIFYING',
      successHeading: 'Credentials Verified',
      successSub: 'Primary authentication confirmed. Initializing 6-digit MFA challenge...',
      successTag: 'STAGE 01 · AUTHENTICATED',
      wrongHeading: 'Authentication Failed',
      wrongSub: errorMessage || 'Invalid terminal email or access key. Please verify your credentials.',
      wrongTag: 'STAGE 01 · ACCESS DENIED',
    },
    mfa: {
      verifyingHeading: 'Verifying MFA Code...',
      verifyingSub: 'Validating 6-digit Google Authenticator signature...',
      verifyingTag: 'STAGE 02 · VERIFYING TOKEN',
      successHeading: 'Identity Verified',
      successSub: 'Cryptographic MFA token validated. Authorizing encrypted bureau terminal...',
      successTag: 'STAGE 02 · ACCESS GRANTED',
      wrongHeading: 'Wrong MFA Code',
      wrongSub: errorMessage || 'The 6-digit authenticator code did not match. Please try again.',
      wrongTag: 'STAGE 02 · TOKEN REJECTED',
    },
    provisioned: {
      verifyingHeading: 'Provisioning Officer...',
      verifyingSub: 'Encrypting officer clearance and committing identity records...',
      verifyingTag: 'BUREAU REGISTRY · SYNCING',
      successHeading: 'Credentials Provisioned',
      successSub: 'Officer security profile and clearance records have been cryptographically committed.',
      successTag: 'BUREAU REGISTRY · VERIFIED',
      wrongHeading: 'Provisioning Failed',
      wrongSub: errorMessage || 'Could not commit officer credentials to the bureau registry.',
      wrongTag: 'BUREAU REGISTRY · ERROR',
    },
    session: {
      verifyingHeading: 'Verifying Session...',
      verifyingSub: 'Validating active terminal clearance and multi-factor handshake...',
      verifyingTag: 'SECURITY GATEWAY · CHECKING',
      successHeading: 'Session Verified',
      successSub: 'Active terminal clearance validated.',
      successTag: 'SECURITY GATEWAY · ACTIVE',
      wrongHeading: 'Session Expired',
      wrongSub: 'Security session could not be verified. Redirecting to terminal login...',
      wrongTag: 'SECURITY GATEWAY · LOCKED',
    },
  };

  const copy = defaultCopy[variant];
  const resolvedTitle =
    title ||
    (step === 'verifying'
      ? copy.verifyingHeading
      : step === 'wrong'
      ? copy.wrongHeading
      : copy.successHeading);

  const resolvedSub =
    subtitle ||
    (step === 'verifying'
      ? copy.verifyingSub
      : step === 'wrong'
      ? copy.wrongSub
      : copy.successSub);

  const resolvedTag =
    statusLabel ||
    (step === 'verifying'
      ? copy.verifyingTag
      : step === 'wrong'
      ? copy.wrongTag
      : copy.successTag);

  return (
    <div
      className={`flex flex-col items-center justify-center text-center animate-in fade-in duration-300 ${
        compact ? 'py-8 px-4 space-y-5' : 'py-10 px-6 space-y-6'
      }`}
      role={step === 'wrong' ? 'alert' : 'status'}
      aria-live={step === 'wrong' ? 'assertive' : 'polite'}
    >
      {/* Animated Concentric Verification Seal */}
      <div className="relative flex items-center justify-center w-24 h-24">
        {/* Outer expanding pulse ring */}
        <div
          className={`absolute inset-0 rounded-full transition-all duration-700 ${
            step === 'success'
              ? 'bg-emerald-500/15 scale-125 animate-ping'
              : step === 'wrong'
              ? 'bg-rose-500/20 scale-115 animate-pulse'
              : 'bg-primary/15 scale-105 animate-ping'
          }`}
          style={{ animationDuration: step === 'verifying' ? '1.2s' : '1.6s' }}
        />

        {/* Secondary rotating/glowing ring */}
        <div
          className={`absolute inset-1.5 rounded-full border-2 transition-all duration-500 ${
            step === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 scale-105'
              : step === 'wrong'
              ? 'border-rose-500/50 bg-rose-500/10 scale-100'
              : 'border-primary/40 border-dashed bg-primary/5 animate-spin'
          }`}
          style={{ animationDuration: '2.5s' }}
        />

        {/* Core Badge */}
        <div
          className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full backdrop-blur-xl border shadow-lg transition-all duration-500 transform ${
            step === 'success'
              ? 'bg-emerald-600/95 border-emerald-300/40 text-white scale-100 shadow-emerald-600/30'
              : step === 'wrong'
              ? 'bg-rose-600/95 border-rose-300/40 text-white scale-100 shadow-rose-600/30 animate-mfa-shake'
              : 'bg-primary/95 border-white/40 text-primary-foreground scale-95 shadow-primary/25'
          }`}
        >
          {step === 'verifying' && <Loader2 className="w-8 h-8 animate-spin" />}
          {step === 'success' && (
            <CheckCircle2 className="w-9 h-9 animate-in zoom-in-50 duration-300" />
          )}
          {step === 'wrong' && (
            <XCircle className="w-9 h-9 animate-in zoom-in-75 duration-200" />
          )}
        </div>

        {/* Corner Security Shield Sub-badge */}
        <div
          className={`absolute -bottom-1 -right-1 z-20 flex items-center justify-center w-7 h-7 rounded-full border-2 border-white dark:border-slate-900 backdrop-blur-md shadow-sm transition-all duration-500 ${
            step === 'success'
              ? 'bg-emerald-100 text-emerald-700 scale-100 opacity-100'
              : step === 'wrong'
              ? 'bg-rose-100 text-rose-700 scale-100 opacity-100'
              : 'bg-primary/20 text-primary scale-90 opacity-100'
          }`}
        >
          {step === 'wrong' ? (
            <ShieldAlert className="w-4 h-4" />
          ) : step === 'verifying' ? (
            <Fingerprint className="w-4 h-4" />
          ) : (
            <ShieldCheck className="w-4 h-4" />
          )}
        </div>
      </div>

      {/* Typography & Status Metadata */}
      <div className="space-y-2 max-w-xs mx-auto">
        <div
          className={`flex items-center justify-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] font-semibold ${
            step === 'success'
              ? 'text-emerald-600 dark:text-emerald-400'
              : step === 'wrong'
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-primary'
          }`}
        >
          <Lock className="w-3 h-3" />
          <span>{resolvedTag}</span>
        </div>

        <h3 className="text-xl font-bold tracking-tight text-foreground">
          {resolvedTitle}
        </h3>

        <p className="text-xs text-muted-foreground leading-relaxed">{resolvedSub}</p>
      </div>

      {/* Officer / User Clearance Telemetry Line */}
      {(userName || userRole) && step !== 'wrong' && (
        <div className="px-3.5 py-1.5 rounded-xl bg-white/50 dark:bg-white/[0.04] backdrop-blur-md border border-white/65 dark:border-white/10 text-[11px] font-mono text-muted-foreground tracking-wide shadow-sm">
          {userName && <span className="font-semibold text-foreground">{userName}</span>}
          {userName && userRole && <span className="mx-2 opacity-40">·</span>}
          {userRole && (
            <span
              className={`uppercase font-semibold ${
                step === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'
              }`}
            >
              {userRole}
            </span>
          )}
          <span className="mx-2 opacity-40">·</span>
          <span className={step === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'}>
            {step === 'success' ? 'VERIFIED' : 'CHECKING'}
          </span>
        </div>
      )}

      {/* Smooth Progress Bar or Retry Action */}
      <div className="w-full max-w-[220px] space-y-2">
        <div className="h-1.5 w-full bg-white/60 dark:bg-white/10 backdrop-blur-sm border border-white/40 dark:border-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              step === 'success'
                ? 'bg-emerald-600'
                : step === 'wrong'
                ? 'bg-rose-600'
                : 'bg-primary animate-pulse'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {step === 'success'
            ? 'Handshake Complete'
            : step === 'wrong'
            ? 'Verification Rejected'
            : 'Verifying Signature...'}
        </p>

        {step === 'wrong' && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 backdrop-blur-md text-rose-600 dark:text-rose-300 text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
