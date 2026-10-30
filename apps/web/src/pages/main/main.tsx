import { Link } from "react-router-dom";
import { Badge, Button, Container, List, Paper, Text, Title } from "@mantine/core";
import "./main.css";

const highlights = [
  "Длительность слота зависит от типа встречи.",
  "Защита от пересечения встреч.",
  "Список предстоящих встреч для владельца.",
];

export function MainPage() {
  return (
    <Container size="lg" className="hero">
      <div className="hero-copy">
        <Badge variant="light" color="brand" size="lg" className="hero-badge">
          Сервис в разработке
        </Badge>
        <Title order={1} className="hero-title">
          Calendar
        </Title>
        <Text size="lg" c="dimmed" className="hero-subtitle">
          Здесь можно будет выбрать тип встречи и записаться на звонок в свободное время.
        </Text>
        <Button component={Link} to="/book" size="md" className="hero-cta" mt="xl">
          Записаться →
        </Button>
      </div>
      <Paper withBorder radius="lg" p="xl" className="hero-panel">
        <Title order={3} size="h4">
          Что планируется
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
