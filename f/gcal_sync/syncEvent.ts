import type { BookingEventData } from '../internal/gcal_utils/buildGCalEvent';
import { buildGCalEvent } from '../internal/gcal_utils/buildGCalEvent';
import type { Result } from '../internal/result/index';
import { isPermanentError, retryWithBackoff } from '../internal/retry/index';
import { callGCalAPI } from "./callGCalAPI";

export async function syncEvent(action: 'create' | 'update' | 'delete', calendarId: string | null, eventId: string | null, accessToken: string, eventData: BookingEventData, maxRetries: number): Promise<Result<string | null>> {
    if (!calendarId) return [null, null];
    const operation = async (): Promise<string | null> => {
            if (action === 'delete') {
              if (!eventId) return null;
              const [err] = await callGCalAPI('DELETE', `events/${eventId}`, calendarId, accessToken);
              if (err) throw err;
              return null;
            }

            const body = buildGCalEvent(eventData);
            const method = eventId ? 'PUT' : 'POST';
            const path = eventId ? `events/${eventId}` : 'events';

            const [err, data] = await callGCalAPI(method, path, calendarId, accessToken, body);
            if (err) throw err;

            const newId = data?.['id'];
            if (typeof newId !== 'string') throw new Error('Invalid GCal response: missing event id');
            return newId;
          };
    const result = await retryWithBackoff(operation, {
            maxAttempts: maxRetries,
            operationName: `gcal_sync_${action}`,
          });
    if (result.success) return [null, result.data];
    const isPermanent = isPermanentError(result.error);
    return [new Error(`${isPermanent ? 'PERMANENT: ' : ''}${result.error.message}`), null];
}
