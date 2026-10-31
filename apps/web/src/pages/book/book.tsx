import { useState, type FormEvent } from "react";
import { Button, Container, Paper, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  meetingTypesCreate,
  meetingTypesList,
  type MeetingType,
} from "../../../../../generated/sdk/client";

import { Availability } from "./availability";
import { ManageType } from "./manage-type";
import { loadAttempt, type Attempt } from "./attempt";
import { Recovery } from "./recovery";

export function BookPage() {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState<Attempt | null>(loadAttempt);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [selectedType, setSelectedType] = useState<MeetingType | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = useQuery({
    queryKey: ["meeting-types"],
    queryFn: async () => {
      const response = await meetingTypesList();
      if (response.status !== 200) throw new Error("Could not load meeting types");
      return response.data;
    },
  });
  const create = useMutation({
    mutationFn: async (input: { name: string; description: string; durationMinutes: number }) => {
      const response = await meetingTypesCreate(input);
      if (response.status !== 201) throw new Error("Could not create meeting type");
      return response.data;
    },
    onSuccess: async () => {
      setName("");
      setDescription("");
      setDuration("");
      await queryClient.invalidateQueries({ queryKey: ["meeting-types"] });
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanDescription = description.trim();
    const durationMinutes = Number(duration);
    const next: Record<string, string> = {};
    if (!cleanName || [...cleanName].length > 100) next.name = "Введите название до 100 символов";
    if (!cleanDescription || [...cleanDescription].length > 1000)
      next.description = "Введите описание до 1000 символов";
    if (
      !duration.trim() ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 2147483647
    )
      next.duration = "Введите целое число от 1 до 2147483647";
    setErrors(next);
    if (!Object.keys(next).length)
      create.mutate({ name: cleanName, description: cleanDescription, durationMinutes });
  }
  if (attempt)
    return (
      <Container size="lg" py="xl">
        <Recovery
          attempt={attempt}
          onDone={() => {
            setAttempt(null);
            setSelectedType(null);
          }}
        />
      </Container>
    );
  if (selectedType)
    return (
      <Container size="lg" py="xl">
        <Availability
          onUnknown={setAttempt}
          name={guestName}
          email={guestEmail}
          setName={setGuestName}
          setEmail={setGuestEmail}
          type={selectedType}
          onBack={() => {
            setSelectedType(null);
            void list.refetch();
          }}
        />
      </Container>
    );
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Title order={1}>Типы встреч</Title>
        {list.isPending && <Text>Загрузка типов встреч…</Text>}
        {list.isError && (
          <div role="alert">
            Не удалось загрузить типы встреч.{" "}
            <Button variant="subtle" onClick={() => void list.refetch()}>
              Повторить
            </Button>
          </div>
        )}
        {list.data?.length === 0 && <Text>Пока нет типов встреч</Text>}
        {list.data?.map((item) => (
          <Paper key={item.id} withBorder radius="md" p="md">
            <Title order={2} size="h4">
              {item.name}
            </Title>
            <Text>{item.description}</Text>
            <Text c="dimmed">{item.durationMinutes} мин.</Text>
            <Button mt="sm" variant="outline" onClick={() => setSelectedType(item)}>
              Выбрать {item.name}
            </Button>
            <ManageType
              type={item}
              refresh={() => {
                void list.refetch();
              }}
            />
          </Paper>
        ))}
        <Paper withBorder radius="md" p="lg">
          <Title order={2} size="h3">
            Создать тип встречи
          </Title>
          <form onSubmit={submit} noValidate>
            <Stack mt="md">
              <TextInput
                label="Название"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                error={errors.name}
                required
              />
              <Textarea
                label="Описание"
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
                error={errors.description}
                required
              />
              <TextInput
                label="Длительность в минутах"
                type="number"
                value={duration}
                onChange={(event) => setDuration(event.currentTarget.value)}
                error={errors.duration}
                required
              />
              {create.isError && (
                <Text role="alert" c="red">
                  Не удалось создать тип встречи. Попробуйте ещё раз.
                </Text>
              )}
              <Button type="submit" loading={create.isPending}>
                Создать тип
              </Button>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
