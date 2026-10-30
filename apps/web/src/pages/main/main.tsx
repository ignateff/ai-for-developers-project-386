import { Link } from "react-router-dom";
import { Badge, Button, Container, List, Paper, Text, Title } from "@mantine/core";
import "./main.css";

const highlights = [
  "Фиксированные 30-минутные слоты с 09:00 до 18:00.",
  "Проверка конфликта при бронировании.",
  "Просмотр предстоящих событий в отдельном разделе.",
];

export function MainPage() {
  return (
    <Container size="lg" className="hero">
      <div className="hero-copy">
        <Badge variant="light" color="brand" size="lg" className="hero-badge">
          Быстрая запись на звонок
        </Badge>
        <Title order={1} className="hero-title">
          Calendar
        </Title>
        <Text size="lg" c="dimmed" className="hero-subtitle">
          Один экран, понятные слоты, быстрая бронь. Выберите время и запишитесь на звонок без
          лишних шагов.
        </Text>
        <Button component={Link} to="/book" size="md" className="hero-cta" mt="xl">
          Записаться →
        </Button>
      </div>
      <Paper withBorder radius="lg" p="xl" className="hero-panel">
        <Title order={3} size="h4">
          Что доступно прямо сейчас
        </Title>
        <List mt="md" spacing="sm" size="sm" c="dimmed">
          {highlights.map((item) => (
            <List.Item key={item}>{item}</List.Item>
          ))}
        </List>
      </Paper>
    </Container>
  );
}
