import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeAppResume,
  syncTeacherBirthdayNotifications,
} from '../lib/birthdayNotifications';
import { isTeacherRole } from '../lib/permissions';

/** Déclenche la notif d’anniversaire dès que le professeur est connecté. */
export function TeacherBirthdayReminders() {
  const { user, roleName, loading } = useAuth();

  useEffect(() => {
    if (loading || !user || !isTeacherRole(roleName)) return;
    void syncTeacherBirthdayNotifications(roleName);
    return subscribeAppResume(() => {
      void syncTeacherBirthdayNotifications(roleName);
    });
  }, [loading, user, roleName]);

  return null;
}
