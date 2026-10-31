import { Button, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { upcomingEvents } from "../../../../../generated/sdk/client";

export function EventsPage() {
  const events = useQuery({
    queryKey: ["upcoming-events"],
    queryFn: async () => {
      const response = await upcomingEvents({ cache: "no-store" });
      if (response.status !== 200) throw new Error("Could not load events");
      return response.data;
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: "always",
  });
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={1}>Предстоящие события</Title>
            <Text c="dimmed">Все запланированные встречи · время в UTC</Text>
          </div>
          <Button
            variant="outline"
            onClick={() => void events.refetch()}
            loading={events.isFetching}
          >
            Обновить
          </Button>
        </Group>
        {events.isPending && <Text role="status">Загрузка событий…</Text>}
        {events.isError && (
          <div role="alert">
            Не удалось загрузить события.{" "}
            <Button variant="subtle" onClick={() => void events.refetch()}>
              Повторить
            </Button>
          </div>
        )}
        {events.data?.length === 0 && <Text>Предстоящих событий пока нет</Text>}
        {events.data?.map((event) => (
          <Paper key={event.id} withBorder radius="md" p="lg">
            <Title order={2} size="h4">
              {event.guestName}
            </Title>
            <Text c="dimmed">{event.guestEmail}</Text>
            <Text mt="md" fw={600}>
              {event.meetingTypeName}
            </Text>
            <Text>
              {event.startsAt.slice(0, 10)} · {event.startsAt.slice(11, 16)} –{" "}
              {event.endsAt.slice(11, 16)} UTC
            </Text>
          </Paper>
        ))}
      </Stack>
    </Container>
  );
}
