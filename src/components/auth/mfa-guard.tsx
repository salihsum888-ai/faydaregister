'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { UserProfile } from '@/lib/types';
import { VerificationAnimation } from '@/components/auth/verification-animation';
import { useTranslation } from '@/i18n/language-provider';

/**
 * MFA & Role Guard Component
 * Enforces mandatory UID-bound OTP verification for all authenticated users
 * and restricts /admin/* routes strictly to administrators.
 */
export function MfaGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const [isVerified, setIsVerified] = useState<boolean | null>(null);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const isAdminRoute = pathname.startsWith('/admin');
  const isPublicPage = pathname === '/login' || pathname === '/';

  useEffect(() => {
    if (isUserLoading) return;

    if (!user) {
      sessionStorage.removeItem('fayda_mfa_verified');
      sessionStorage.removeItem('fayda_mfa_verified_uid');
      if (!isPublicPage) {
        router.push('/login');
      }
      setIsVerified(false);
      return;
    }

    // Authenticated user check: bind MFA verification to the active user's UID
    const mfaFlag = sessionStorage.getItem('fayda_mfa_verified') === 'true';
    const mfaUid = sessionStorage.getItem('fayda_mfa_verified_uid');
    const mfaSatisfied = mfaFlag && (!mfaUid || mfaUid === user.uid);

    if (!mfaSatisfied && !isPublicPage) {
      router.push('/login');
      setIsVerified(false);
      return;
    }

    // Role-based access control for /admin/* routes
    if (isAdminRoute && !isProfileLoading) {
      if (!profile || profile.role !== 'admin') {
        router.replace('/dashboard');
        setIsVerified(false);
        return;
      }
    }

    setIsVerified(true);
  }, [user, isUserLoading, isProfileLoading, profile, pathname, isPublicPage, isAdminRoute, router]);

  const isChecking =
    isUserLoading ||
    (user && isVerified === null) ||
    (user && isAdminRoute && (isProfileLoading || profile?.role !== 'admin'));

  if (isChecking && !isPublicPage) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-[32px] border border-border bg-card shadow-xl">
          <VerificationAnimation
            variant="session"
            userName={profile?.fullName}
            userRole={
              profile?.role === 'admin'
                ? t.common.adminRole
                : profile?.role
                ? t.common.officerRole
                : undefined
            }
            durationMs={600}
            compact
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
