import type { BookingRow } from '../internal/db-types/index';
import type { Result } from '../internal/result/index';
import { type Input } from "./types";

export function authorize(input: Input, booking: BookingRow): Result<true> {
    if (input.actor === 'client' && booking.client_id !== input.actor_id) {
    return [new Error('Unauthorized: client_id mismatch'), null];
    }

    if (input.actor === 'provider' && booking.provider_id !== input.actor_id) {
    return [new Error('Unauthorized: provider_id mismatch'), null];
    }

    return [null, true];
}
