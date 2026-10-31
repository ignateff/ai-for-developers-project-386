import { validateType } from "./validate-type";
import { useState, type FormEvent } from "react";
import { Button, Stack, Text, Textarea, TextInput } from "@mantine/core";
import {
  meetingTypeResourceRemove,
  meetingTypeResourceUpdate,
  type MeetingType,
} from "../../../../../generated/sdk/client";

export function ManageType({ type, refresh }: { type: MeetingType; refresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState(type.name);
  const [description, setDescription] = useState(type.description);
  const [duration, setDuration] = useState(String(type.durationMinutes));
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    const {
      cleanName,
      cleanDescription,
      minutes,
      fields: next,
    } = validateType(name, description, duration);
    setFields(next);
    if (Object.keys(next).length) return;
    setPending(true);
    setError("");
    try {
      const response = await meetingTypeResourceUpdate(
        type.id,
        { name: cleanName, description: cleanDescription, durationMinutes: minutes },
        { headers: { "If-Match": `"${type.version}"` } },
      );
      if (response.status === 200) {
        setEditing(false);
        refresh();
      } else if (response.status === 412 || response.status === 404) {
        setEditing(false);
        setError("Тип встречи изменился или удалён. Список обновлён.");
        refresh();
      } else setError("Не удалось сохранить изменения. Попробуйте ещё раз.");
    } catch {
      setError("Не удалось сохранить изменения. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    setPending(true);
    setError("");
    try {
      const response = await meetingTypeResourceRemove(type.id, {
        headers: { "If-Match": `"${type.version}"` },
      });
      if (response.status === 204) {
        setConfirm(false);
        refresh();
      } else if (response.status === 412 || response.status === 404) {
        setConfirm(false);
        setError("Тип встречи изменился или удалён. Список обновлён.");
        refresh();
      } else setError("Не удалось удалить тип. Попробуйте ещё раз.");
    } catch {
      setError("Не удалось удалить тип. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Stack mt="sm" align="flex-start">
      {!editing && !confirm && (
        <>
          <Button
            variant="subtle"
            onClick={() => {
              setName(type.name);
              setDescription(type.description);
              setDuration(String(type.durationMinutes));
              setEditing(true);
            }}
          >
            Изменить {type.name}
          </Button>
          <Button variant="subtle" color="red" onClick={() => setConfirm(true)}>
            Удалить {type.name}
          </Button>
        </>
      )}
      {editing && (
        <form onSubmit={(event) => void save(event)} noValidate>
          <Stack>
            <TextInput
              label="Название типа"
              required
              error={fields.name}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            <Textarea
              label="Описание типа"
              required
              error={fields.description}
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
            <TextInput
              label="Длительность типа в минутах"
              type="number"
              required
              error={fields.duration}
              value={duration}
              onChange={(event) => setDuration(event.currentTarget.value)}
            />
            <Button type="submit" loading={pending}>
              Сохранить
            </Button>
            <Button variant="subtle" onClick={() => setEditing(false)}>
              Отмена
            </Button>
          </Stack>
        </form>
      )}
      {confirm && (
        <>
          <Text>
            Удалить тип «{type.name}»? Новые записи станут недоступны, существующие сохранятся.
          </Text>
          <Button color="red" loading={pending} onClick={() => void remove()}>
            Подтвердить удаление
          </Button>
          <Button variant="subtle" onClick={() => setConfirm(false)}>
            Отмена
          </Button>
        </>
      )}
      {error && (
        <Text role="alert" c="red">
          {error}
        </Text>
      )}
    </Stack>
  );
}
