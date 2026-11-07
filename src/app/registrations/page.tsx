'use client';

import { useMemoFirebase, useCollection, useUser, useFirestore } from '@/firebase';
import { collection, query, limit, where } from 'firebase/firestore';
import { RegistrationsList } from '@/components/registrations/registrations-list';
import { Loader2 } from 'lucide-react';
import { Registration } from '@/lib/types';

export default function RegistrationsManagementPage() {
  const { user } = useUser();
  const db = useFirestore();

  const registrationsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'registrations'), 
      where('assignedReviewerId', '==', user.uid),
      limit(10000)
    );
  }, [db, user]);

  const { data: registrations, isLoading } = useCollection<Registration>(registrationsQuery);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
        </div>
      ) : (
        <RegistrationsList initialRegistrations={registrations || []} />
      )}
    </div>
  );
}

