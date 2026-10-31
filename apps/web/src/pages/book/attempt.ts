import type { BookingInput } from "../../../../../generated/sdk/client";

export type Attempt = { key: string; input: BookingInput };
const storageKey = "calendar-booking-attempt";
export function loadAttempt(): Attempt | null {
  try {
    const value = sessionStorage.getItem(storageKey);
    return value ? (JSON.parse(value) as Attempt) : null;
  } catch {
    return null;
  }
}
export function saveAttempt(attempt: Attempt) {
  sessionStorage.setItem(storageKey, JSON.stringify(attempt));
}
export function clearAttempt() {
  sessionStorage.removeItem(storageKey);
}
