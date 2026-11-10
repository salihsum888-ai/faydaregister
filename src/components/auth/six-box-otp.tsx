'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
  Fingerprint,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Lock,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/language-provider';

export type OtpVerificationStatus = 'idle' | 'verifying' | 'wrong' | 'success';

interface SixBoxOtpProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (code: string) => void;
  status: OtpVerificationStatus;
  onResetStatus?: () => void;
  errorMessage?: string;
  successTitle?: string;
  successSubtitle?: string;
  userName?: string;
  userRole?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  showHeaderSeal?: boolean;
  label?: string;
}

export function SixBoxOtp({
  value,
  onChange,
  onComplete,
  status,
  onResetStatus,
  errorMessage,
  successTitle,
  successSubtitle,
  userName,
  userRole,
  autoFocus = true,
  disabled = false,
  showHeaderSeal = true,
  label,
}: SixBoxOtpProps) {
  const { t } = useTranslation();
  const resolvedErrorMessage = errorMessage || t.auth.invalidOtpError;
  const resolvedSuccessTitle = successTitle || t.auth.identityVerifiedTitle;
  const resolvedSuccessSubtitle = successSubtitle || t.auth.identityVerifiedSubtitle;
  const resolvedLabel = label || t.auth.authenticatorCodeLabel;

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const lastSubmittedRef = useRef<string>('');

  // Convert string value into 6-element array
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus && status === 'idle') {
      const firstEmpty = Math.min(value.length, 5);
      inputRefs.current[firstEmpty]?.focus();
    }
  }, [autoFocus, status]);

  // Reset lastSubmitted tracker when code is cleared or status resets to idle
  useEffect(() => {
    if (value.length < 6 && status === 'idle') {
      lastSubmittedRef.current = '';
    }
  }, [value, status]);

  // Auto-trigger onComplete when all 6 boxes are filled
  useEffect(() => {
    if (
      value.length === 6 &&
      status === 'idle' &&
      onComplete &&
      lastSubmittedRef.current !== value
    ) {
      lastSubmittedRef.current = value;
      onComplete(value);
    }
  }, [value, status, onComplete]);

  // Auto-clear boxes after "wrong" animation finishes so user can immediately type again
  useEffect(() => {
    if (status === 'wrong') {
      const timer = setTimeout(() => {
        onChange('');
        lastSubmittedRef.current = '';
        onResetStatus?.();
        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 40);
      }, 1600);
      return () => clearTimeout(timer);
    }
  }, [status, onChange, onResetStatus]);

  const handleDigitChange = (index: number, rawVal: string) => {
    if (disabled || status === 'verifying' || status === 'success') return;

    // If user starts typing while in 'wrong' state, immediately clear and accept new digit
    if (status === 'wrong') {
      const cleanDigit = rawVal.replace(/\D/g, '').slice(-1);
      onResetStatus?.();
      lastSubmittedRef.current = '';
      onChange(cleanDigit);
      if (cleanDigit && index < 5) {
        inputRefs.current[1]?.focus();
      }
      return;
    }

    const numeric = rawVal.replace(/\D/g, '');

    // Handle multi-digit input (e.g., mobile autocomplete or fast typing)
    if (numeric.length > 1) {
      const nextChars = numeric.slice(0, 6 - index).split('');
      const nextDigits = [...digits];
      nextChars.forEach((char, offset) => {
        if (index + offset < 6) {
          nextDigits[index + offset] = char;
        }
      });
      const combined = nextDigits.join('');
      onChange(combined);
      const nextFocus = Math.min(index + nextChars.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    const nextDigits = [...digits];
    nextDigits[index] = numeric;
    const combined = nextDigits.join('');
    onChange(combined);

    if (numeric && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled || status === 'verifying' || status === 'success') return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (status === 'wrong') {
        onResetStatus?.();
        onChange('');
        lastSubmittedRef.current = '';
        inputRefs.current[0]?.focus();
        return;
      }

      const nextDigits = [...digits];
      if (nextDigits[index]) {
        nextDigits[index] = '';
        onChange(nextDigits.join(''));
      } else if (index > 0) {
        nextDigits[index - 1] = '';
        onChange(nextDigits.join(''));
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled || status === 'verifying' || status === 'success') return;
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    if (status === 'wrong') {
      onResetStatus?.();
    }
    lastSubmittedRef.current = '';
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const handleManualReset = () => {
    onChange('');
    lastSubmittedRef.current = '';
    onResetStatus?.();
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 30);
  };

  return (
    <div className="w-full space-y-6">
      {/* Dynamic Animated Security Seal */}
      {showHeaderSeal && (
        <div className="flex flex-col items-center justify-center pt-1">
          <div className="relative flex items-center justify-center w-20 h-20">
            {/* Outer Ring Pulse */}
            <div
              className={cn(
                'absolute inset-0 rounded-full transition-all duration-500',
                status === 'idle' && 'bg-primary/10 scale-95',
                status === 'verifying' && 'bg-primary/20 scale-110 animate-ping',
                status === 'wrong' && 'bg-rose-500/20 scale-110 animate-pulse',
                status === 'success' && 'bg-emerald-500/20 scale-125 animate-ping'
              )}
              style={{ animationDuration: status === 'verifying' ? '1.1s' : '1.5s' }}
            />

            {/* Secondary Ring */}
            <div
              className={cn(
                'absolute inset-1.5 rounded-full border-2 transition-all duration-500',
                status === 'idle' && 'border-primary/20 bg-primary/5',
                status === 'verifying' &&
                  'border-primary border-dashed bg-primary/10 animate-spin',
                status === 'wrong' && 'border-rose-500/50 bg-rose-500/10',
                status === 'success' && 'border-emerald-500/50 bg-emerald-500/10 scale-105'
              )}
              style={{ animationDuration: '2.4s' }}
            />

            {/* Core Icon Badge */}
            <div
              className={cn(
                'relative z-10 flex items-center justify-center w-14 h-14 rounded-2xl backdrop-blur-xl border shadow-lg transition-all duration-300',
                status === 'idle' &&
                  'bg-white/75 dark:bg-white/10 border-white/80 dark:border-white/15 text-primary shadow-primary/10',
                status === 'verifying' &&
                  'bg-primary/90 border-white/40 text-primary-foreground shadow-primary/30 scale-105',
                status === 'wrong' &&
                  'bg-rose-600/95 border-rose-300/40 text-white shadow-rose-600/30 animate-mfa-shake',
                status === 'success' &&
                  'bg-emerald-600/95 border-emerald-300/40 text-white shadow-emerald-600/30 scale-105'
              )}
            >
              {status === 'idle' && <Fingerprint className="w-7 h-7" />}
              {status === 'verifying' && <Loader2 className="w-7 h-7 animate-spin" />}
              {status === 'wrong' && <XCircle className="w-7 h-7 animate-in zoom-in-75 duration-200" />}
              {status === 'success' && (
                <CheckCircle2 className="w-7 h-7 animate-in zoom-in-50 duration-300" />
              )}
            </div>

            {/* Corner Sub-badge */}
            <div
              className={cn(
                'absolute -bottom-1 -right-1 z-20 flex items-center justify-center w-6 h-6 rounded-full border-2 border-white dark:border-slate-900 backdrop-blur-md shadow-sm transition-all duration-300',
                status === 'idle' && 'opacity-0 scale-50',
                status === 'verifying' && 'bg-primary/20 text-primary opacity-100 scale-100',
                status === 'wrong' && 'bg-rose-100 text-rose-700 opacity-100 scale-100',
                status === 'success' && 'bg-emerald-100 text-emerald-700 opacity-100 scale-100'
              )}
            >
              {status === 'wrong' ? (
                <ShieldAlert className="w-3.5 h-3.5" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Label & Progress Counter */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {resolvedLabel}
          </span>
          <span
            className={cn(
              'text-[10px] font-mono font-bold uppercase tracking-wider transition-colors',
              status === 'idle' && 'text-muted-foreground',
              status === 'verifying' && 'text-primary',
              status === 'wrong' && 'text-rose-600 dark:text-rose-400',
              status === 'success' && 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {status === 'idle' && t.mfa.digitsCounter.replace('{count}', String(value.length))}
            {status === 'verifying' && t.mfa.verifyingShort}
            {status === 'wrong' && t.mfa.wrongCodeShort}
            {status === 'success' && t.mfa.verifiedShort}
          </span>
        </div>

        {/* 6 Individual Frosted Glass MFA Boxes */}
        <div
          className={cn(
            'grid grid-cols-6 gap-2 sm:gap-2.5 justify-items-center',
            status === 'wrong' && 'animate-mfa-shake'
          )}
        >
          {digits.map((digit, index) => {
            const isFilled = Boolean(digit);
            const isFocused = focusedIndex === index && status === 'idle';

            return (
              <div
                key={index}
                className={cn(
                  'relative w-full',
                  status === 'verifying' && 'animate-mfa-wave',
                  status === 'success' && 'animate-mfa-success-pop'
                )}
                style={{
                  animationDelay:
                    status === 'verifying'
                      ? `${index * 90}ms`
                      : status === 'success'
                      ? `${index * 55}ms`
                      : '0ms',
                }}
              >
                <input
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={digit}
                  disabled={disabled || status === 'verifying' || status === 'success'}
                  onFocus={() => setFocusedIndex(index)}
                  onBlur={() => setFocusedIndex(null)}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  aria-label={t.mfa.digitAriaLabel.replace('{index}', String(index + 1))}
                  className={cn(
                    'w-full h-14 sm:h-16 text-center text-xl sm:text-2xl font-mono font-black rounded-2xl border-2 backdrop-blur-xl outline-none transition-all duration-200 tabular-nums caret-primary select-all shadow-[0_4px_14px_-4px_rgba(15,23,42,0.08),0_1px_0_0_rgba(255,255,255,0.65)_inset] dark:shadow-[0_4px_14px_-4px_rgba(0,0,0,0.4),0_1px_0_0_rgba(255,255,255,0.08)_inset]',
                    // IDLE STATES
                    status === 'idle' &&
                      !isFilled &&
                      !isFocused &&
                      'bg-white/55 dark:bg-white/[0.04] border-white/80 dark:border-white/10 text-foreground hover:bg-white/75 dark:hover:bg-white/[0.08] hover:border-primary/40',
                    status === 'idle' &&
                      isFilled &&
                      !isFocused &&
                      'bg-white/85 dark:bg-primary/[0.12] border-primary/50 text-foreground shadow-md shadow-primary/10 scale-[1.02]',
                    status === 'idle' &&
                      isFocused &&
                      'bg-white/95 dark:bg-slate-900/90 border-primary ring-4 ring-primary/20 text-foreground scale-[1.06] shadow-lg shadow-primary/15 z-10',
                    // VERIFYING STATE
                    status === 'verifying' &&
                      'bg-primary/15 dark:bg-primary/20 border-primary text-primary shadow-lg shadow-primary/15 cursor-wait',
                    // WRONG STATE
                    status === 'wrong' &&
                      'bg-rose-500/15 dark:bg-rose-500/20 border-rose-500 text-rose-600 dark:text-rose-300 shadow-lg shadow-rose-500/15',
                    // SUCCESS STATE
                    status === 'success' &&
                      'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500 text-emerald-600 dark:text-emerald-300 shadow-lg shadow-emerald-500/20'
                  )}
                />

                {/* Bottom Status Indicator Bar per Box */}
                <div
                  className={cn(
                    'mx-auto mt-1.5 h-1 rounded-full transition-all duration-300',
                    status === 'idle' && isFocused && 'w-6 bg-primary shadow-[0_0_8px_rgba(37,99,235,0.6)]',
                    status === 'idle' && isFilled && !isFocused && 'w-4 bg-primary/50',
                    status === 'idle' && !isFilled && !isFocused && 'w-2 bg-slate-300/70 dark:bg-slate-700',
                    status === 'verifying' && 'w-6 bg-primary animate-pulse',
                    status === 'wrong' && 'w-6 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]',
                    status === 'success' && 'w-6 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                  )}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Animated Glass Status Feedback Panel (Verifying / Wrong / Success UI) */}
      {status === 'verifying' && (
        <div
          className="rounded-2xl border border-primary/30 bg-white/60 dark:bg-primary/[0.08] backdrop-blur-xl p-4 text-center space-y-2.5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t.mfa.verifyingTokenTitle}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t.mfa.verifyingTokenSub}
          </p>
          <div className="h-1.5 w-full bg-primary/15 rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-primary rounded-full animate-pulse" />
          </div>
        </div>
      )}

      {status === 'wrong' && (
        <div
          className="rounded-2xl border border-rose-500/35 bg-rose-500/10 dark:bg-rose-500/15 backdrop-blur-xl p-4 text-center space-y-2.5 shadow-sm animate-in fade-in zoom-in-95 duration-200"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">
            <XCircle className="w-4 h-4 shrink-0" />
            <span>{t.mfa.failedWrongCodeTitle}</span>
          </div>
          <p className="text-[11px] text-rose-700/85 dark:text-rose-200/85 leading-relaxed">
            {resolvedErrorMessage}
          </p>
          <button
            type="button"
            onClick={handleManualReset}
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-300 hover:underline pt-0.5"
          >
            <RotateCcw className="w-3 h-3" />
            {t.mfa.clearReenterBtn}
          </button>
        </div>
      )}

      {status === 'success' && (
        <div
          className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 dark:bg-emerald-500/15 backdrop-blur-xl p-4 text-center space-y-2.5 shadow-sm animate-in fade-in zoom-in-95 duration-300"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{resolvedSuccessTitle} · {t.mfa.accessGrantedSuffix}</span>
          </div>
          <p className="text-[11px] text-emerald-800/85 dark:text-emerald-200/85 leading-relaxed">
            {resolvedSuccessSubtitle}
          </p>
          {(userName || userRole) && (
            <div className="pt-0.5 text-[10px] font-mono text-emerald-800 dark:text-emerald-300 tracking-wider uppercase">
              {userName && <span className="font-bold">{userName}</span>}
              {userName && userRole && <span className="mx-1.5 opacity-50">·</span>}
              {userRole && <span>{userRole}</span>}
            </div>
          )}
          <div className="h-1.5 w-full bg-emerald-500/20 rounded-full overflow-hidden">
            <div className="h-full w-full bg-emerald-600 rounded-full transition-all duration-500" />
          </div>
        </div>
      )}
    </div>
  );
}
