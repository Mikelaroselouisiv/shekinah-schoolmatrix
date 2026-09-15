import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeAppResume } from '../lib/birthdayNotifications';
import { syncMorningDutyNotifications } from '../lib/morningDutyNotifications';
import { isParentRole } from '../lib/permissions';

/** Notifie la veille d’une affectation (accueil, drapeau, défi…). */
export function TeacherMorningDutyReminders() {
  const { user, roleName, loading } = useAuth();
  const userId = user?.id ?? user?.userId ?? null;

  useEffect(() => {
    if (loading || !user || isParentRole(roleName) || userId == null) return;
    void syncMorningDutyNotifications(roleName, userId);
    return subscribeAppResume(() => {
      void syncMorningDutyNotifications(roleName, userId);
    });
  }, [loading, user, roleName, userId]);

  return null;
}
