import { useState } from "react";
import { Button, Paper, Stack, Text, Title } from "@mantine/core";
import { createBooking, type Booking } from "../../../../../generated/sdk/client";
import { clearAttempt, type Attempt } from "./attempt";

export function Recovery({ attempt, onDone }: { attempt: Attempt; onDone: () => void }) {
  const [pending, setPending] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const [message, setMessage] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  async function retry() {
    setPending(true);
    setMessage("");
    try {
      const response = await createBooking(attempt.input, {
        headers: { "Idempotency-Key": attempt.key },
      });
      if (response.status === 201) {
        clearAttempt();
        setBooking(response.data);
      } else if (response.status === 400 || response.status === 409) {
        clearAttempt();
        setMessage(`${response.data.message} Начните новую попытку.`);
      } else setMessage("Результат неизвестен. Повторите попытку или осознанно забудьте её.");
    } catch {
      setMessage("Результат неизвестен. Повторите попытку или осознанно забудьте её.");
    } finally {
      setPending(false);
    }
  }
  if (booking)
    return (
      <Paper p="lg">
        <Title order={2}>Запись подтверждена</Title>
        <Text>{booking.meetingTypeName}</Text>
        <Text>
          {booking.startsAt} — {booking.endsAt} UTC
        </Text>
        <Button onClick={onDone}>Записаться ещё</Button>
      </Paper>
    );
  return (
    <Paper p="lg">
      <Stack>
        <Title order={2}>Незавершённая попытка записи</Title>
        <Text>
          Результат неизвестен. Повтор может впервые создать запись, если первый запрос не дошёл.
        </Text>
        <Text>
          {attempt.input.startsAt} UTC · {attempt.input.guestName} · {attempt.input.guestEmail}
        </Text>
        {message && <Text role="alert">{message}</Text>}
        {loadable(message) ? (
          <>
            <Button onClick={() => void retry()} loading={pending}>
              Повторить попытку
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setConfirmForget(true)}>
              Забыть попытку
            </Button>
            {confirmForget && (
              <>
                <Text>
                  Запись может существовать и не отменяется. Новая попытка может создать вторую
                  запись.
                </Text>
                <Button
                  disabled={pending}
                  onClick={() => {
                    clearAttempt();
                    onDone();
                  }}
                >
                  Подтвердить забывание
                </Button>
                <Button variant="subtle" onClick={() => setConfirmForget(false)}>
                  Назад
                </Button>
              </>
            )}
          </>
        ) : (
          <Button onClick={onDone}>Начать заново</Button>
        )}
      </Stack>
    </Paper>
  );
}
function loadable(message: string) {
  return !message.endsWith("Начните новую попытку.");
}
