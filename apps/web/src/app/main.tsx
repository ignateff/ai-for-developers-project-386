import "@mantine/core/styles.css";
import { MantineProvider, Container, Title, Text } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { StrictMode } from "react";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider>
      <Container py="xl">
        <Title>Календарь звонков</Title>
        <Text mt="md">Приложение находится в разработке.</Text>
      </Container>
    </MantineProvider>
  </StrictMode>,
);
