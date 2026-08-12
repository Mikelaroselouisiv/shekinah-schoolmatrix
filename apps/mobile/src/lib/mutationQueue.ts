import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import {
  recordPayment,
  saveAttendanceBulk,
} from '../services/api';

const QUEUE_KEY = 'sm_mutation_queue';

export type QueuedMutation =
  | {
      id: string;
      type: 'attendance';
      createdAt: string;
      payload: {
        class_id: string;
        date: string;
        records: { student_id: string; status: string }[];
      };
    }
  | {
      id: string;
      type: 'payment';
      createdAt: string;
      payload: {
        student_id: string;
        class_id: string;
        academic_year: string;
        service_id: string;
        amount_paid: number;
        payment_date: string;
        bank_account_id?: string | null;
      };
    };

export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) return false;
    if (state.isInternetReachable === false) return false;
    return true;
  } catch {
    return true; // assume online if we can't tell
  }
}

async function readQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedMutation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function getPendingMutationCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function clearMutationQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function listPendingMutations(): Promise<QueuedMutation[]> {
  return readQueue();
}

export async function enqueueMutation(
  mutation: Omit<QueuedMutation, 'id' | 'createdAt'> & { id?: string },
): Promise<QueuedMutation> {
  const item = {
    ...mutation,
    id: mutation.id || `${mutation.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  } as QueuedMutation;
  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
  return item;
}

export async function flushMutationQueue(): Promise<{
  flushed: number;
  remaining: number;
  errors: string[];
}> {
  if (!(await isOnline())) {
    const q = await readQueue();
    return { flushed: 0, remaining: q.length, errors: [] };
  }
  const queue = await readQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0, errors: [] };

  const remaining: QueuedMutation[] = [];
  const errors: string[] = [];
  let flushed = 0;

  for (const item of queue) {
    try {
      if (item.type === 'attendance') {
        await saveAttendanceBulk(
          item.payload.class_id,
          item.payload.date,
          item.payload.records,
        );
      } else if (item.type === 'payment') {
        await recordPayment(item.payload);
      }
      flushed += 1;
    } catch (err) {
      remaining.push(item);
      errors.push(
        err instanceof Error ? err.message : `Échec ${item.type} ${item.id}`,
      );
    }
  }

  await writeQueue(remaining);
  return { flushed, remaining: remaining.length, errors };
}

/** Appel : envoie immédiatement ou met en file si offline. */
export async function saveAttendanceWithQueue(
  classId: string,
  date: string,
  records: { student_id: string; status: string }[],
): Promise<{ queued: boolean }> {
  if (!(await isOnline())) {
    await enqueueMutation({
      type: 'attendance',
      payload: { class_id: classId, date, records },
    });
    return { queued: true };
  }
  try {
    await saveAttendanceBulk(classId, date, records);
    return { queued: false };
  } catch (err) {
    // réseau mort en plein appel
    await enqueueMutation({
      type: 'attendance',
      payload: { class_id: classId, date, records },
    });
    return { queued: true };
  }
}

export async function recordPaymentWithQueue(body: {
  student_id: string;
  class_id: string;
  academic_year: string;
  service_id: string;
  amount_paid: number;
  payment_date: string;
  bank_account_id?: string | null;
}): Promise<{ queued: boolean }> {
  if (!(await isOnline())) {
    await enqueueMutation({ type: 'payment', payload: body });
    return { queued: true };
  }
  try {
    await recordPayment(body);
    return { queued: false };
  } catch {
    await enqueueMutation({ type: 'payment', payload: body });
    return { queued: true };
  }
}
