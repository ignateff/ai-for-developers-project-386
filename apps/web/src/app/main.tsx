import "@mantine/core/styles.css";
import "./theme.css";
import { Anchor, Container, MantineProvider, Text, Title } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { theme } from "./theme";
import { ThemePreview } from "./theme-preview";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      {window.location.pathname.replace(/\/$/, "") === "/theme-preview" ? (
        <ThemePreview />
      ) : (
        <Container py="xl">
          <Title>Календарь звонков</Title>
          <Text mt="md">Приложение находится в разработке.</Text>
          <Anchor href="/theme-preview" mt="md" display="inline-block">
            Посмотреть тему и компоненты
          </Anchor>
        </Container>
      )}
    </MantineProvider>
  </StrictMode>,
);
