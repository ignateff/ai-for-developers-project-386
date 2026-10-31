import { useRef, useState, type FormEvent } from "react";
import { Button, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { createBooking, type Booking, type MeetingType } from "../../../../../generated/sdk/client";
import { isValidEmail } from "./email";
import { saveAttempt, clearAttempt, type Attempt } from "./attempt";

export function BookingForm({
  type,
  onUnknown,
  onPendingChange,
  startsAt,
  name,
  email,
  setName,
  setEmail,
  onBack,
  onConflict,
  onTypeChanged,
  onSuccess,
}: {
  type: MeetingType;
  onUnknown: (attempt: Attempt) => void;
  onPendingChange?: (pending: boolean) => void;
  startsAt: string;
  name: string;
  email: string;
  setName: (value: string) => void;
  setEmail: (value: string) => void;
  onBack: () => void;
  onConflict: () => void;
  onTypeChanged: () => void;
  onSuccess: (booking: Booking) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const guestName = name.trim(),
      guestEmail = email.trim();
    const next: Record<string, string> = {};
    if (!guestName || [...guestName].length > 100) next.guestName = "Введите имя до 100 символов";
    if (!guestEmail || [...guestEmail].length > 254 || !isValidEmail(guestEmail))
      next.guestEmail = "Введите корректный email до 254 символов";
    setErrors(next);
    if (Object.keys(next).length || pendingRef.current) return;
    const input = {
      meetingTypeId: type.id,
      meetingTypeVersion: type.version,
      startsAt,
      guestName,
      guestEmail,
    };
    const attempt = { input, key: crypto.randomUUID() };
    try {
      saveAttempt(attempt);
    } catch {
      setError("Не удалось сохранить попытку в этой вкладке.");
      return;
    }
    pendingRef.current = true;
    setPending(true);
    onPendingChange?.(true);
    setError("");
    try {
      const response = await createBooking(input, {
        headers: { "Idempotency-Key": attempt.key },
      });
      if (response.status === 201) {
        clearAttempt();
        onSuccess(response.data);
      } else if (response.status === 409 && response.data.code === "SLOT_UNAVAILABLE") {
        clearAttempt();
        onConflict();
      } else if (response.status === 409 && response.data.code === "MEETING_TYPE_CHANGED") {
        clearAttempt();
        onTypeChanged();
      } else if (response.status === 400) {
        clearAttempt();
        setErrors(response.data.fields ?? {});
        setError(response.data.message);
      } else onUnknown(attempt);
    } catch {
      onUnknown(attempt);
    } finally {
      pendingRef.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }
  return (
    <Paper withBorder radius="md" p="lg">
      <Title order={3} size="h4">
        Подтверждение записи
      </Title>
      <Text>
        {type.name} · {startsAt.slice(0, 10)} {startsAt.slice(11, 16)} UTC
      </Text>
      <Button variant="subtle" disabled={pending} onClick={onBack}>
        Изменить время
      </Button>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Stack mt="md">
          <TextInput
            disabled={pending}
            label="Имя"
            required
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={errors.guestName}
          />
          <TextInput
            disabled={pending}
            label="Email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            error={errors.guestEmail}
          />
          {error && (
            <Text role="alert" c="red">
              {error}
            </Text>
          )}
          <Button type="submit" loading={pending}>
            Подтвердить запись
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
