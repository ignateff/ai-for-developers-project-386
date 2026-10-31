import { useState } from "react";
import { Button, Paper, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  availabilitySlots,
  availabilitySummary,
  type MeetingType,
} from "../../../../../generated/sdk/client";
import "./availability.css";

export function Availability({ type, onBack }: { type: MeetingType; onBack: () => void }) {
  const [date, setDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const summary = useQuery({
    queryKey: ["availability", type.id],
    queryFn: async () => {
      const response = await availabilitySummary(type.id);
      if (response.status !== 200) throw new Error("Could not load availability");
      return response.data;
    },
  });
  const slots = useQuery({
    queryKey: ["slots", type.id, date],
    enabled: date !== null,
    queryFn: async () => {
      const response = await availabilitySlots(type.id, { date: date! });
      if (response.status !== 200) throw new Error("Could not load slots");
      return response.data;
    },
  });
  const outdated =
    (summary.data && summary.data.version !== type.version) ||
    (slots.data && slots.data.version !== type.version);
  return (
    <section aria-label="Выбор даты и времени">
      <Button variant="subtle" onClick={onBack}>
        ← Выбрать другой тип
      </Button>
      <Title order={2}>Запись на звонок</Title>
      <Text c="dimmed">
        Выберите удобную дату и время для звонка. Все даты и время указаны в UTC.
      </Text>
      {outdated && (
        <Text role="alert" c="red">
          Тип встречи изменился. Вернитесь к выбору типа и обновите страницу.
        </Text>
      )}
      <div className="availability-grid">
        <Paper withBorder radius="md" p="lg">
          <Title order={3} size="h4">
            Информация
          </Title>
          <Text mt="md">{type.name}</Text>
          <Text>{type.description}</Text>
          <Text>{type.durationMinutes} мин.</Text>
          <Text mt="md">Дата: {date ?? "Не выбрана"}</Text>
          <Text>Время: {selected ? `${selected.slice(11, 16)} UTC` : "Не выбрано"}</Text>
          <Text mt="md">Часовой пояс: UTC</Text>
        </Paper>
        <Paper withBorder radius="md" p="lg">
          <Title order={3} size="h4">
            Календарь
          </Title>
          <Text c="dimmed">Выберите день</Text>
          {summary.isPending && <Text>Загрузка доступности…</Text>}
          {summary.isError && (
            <div role="alert">
              Не удалось загрузить доступность.{" "}
              <Button variant="subtle" onClick={() => void summary.refetch()}>
                Повторить
              </Button>
            </div>
          )}
          <div className="availability-dates">
            {summary.data?.days.map((day) => (
              <Button
                key={day.date}
                variant={date === day.date ? "filled" : "outline"}
                aria-pressed={date === day.date}
                disabled={Boolean(outdated)}
                onClick={() => {
                  setDate(day.date);
                  setSelected(null);
                }}
              >
                {day.date} · {day.availableCount} свободно
              </Button>
            ))}
          </div>
        </Paper>
        <Paper withBorder radius="md" p="lg">
          <Title order={3} size="h4">
            Доступное время
          </Title>
          {!date && <Text c="dimmed">Выберите дату</Text>}
          {date && slots.isPending && <Text>Загрузка слотов…</Text>}
          {slots.isError && (
            <div role="alert">
              Не удалось загрузить слоты.{" "}
              <Button variant="subtle" onClick={() => void slots.refetch()}>
                Повторить
              </Button>
            </div>
          )}
          {date && slots.data?.slots.length === 0 && <Text>На эту дату нет доступных слотов</Text>}
          {slots.data &&
            slots.data.slots.length > 0 &&
            !slots.data.slots.some((slot) => slot.available) && (
              <Text>На эту дату нет свободных слотов</Text>
            )}
          <div className="availability-slots">
            {slots.data?.slots.map((slot) => (
              <Button
                key={slot.startsAt}
                variant={selected === slot.startsAt ? "filled" : "outline"}
                disabled={!slot.available || Boolean(outdated)}
                aria-pressed={selected === slot.startsAt}
                onClick={() => setSelected(slot.startsAt)}
              >
                {slot.startsAt.slice(11, 16)} UTC{slot.available ? "" : " · Занято"}
              </Button>
            ))}
          </div>
        </Paper>
      </div>
    </section>
  );
}
