import "@mantine/core/styles.css";
import "./theme.css";
import { MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { theme } from "./theme";
import { AppQueryProvider } from "./query-provider";
import { ThemePreview } from "./theme-preview";
import { Layout } from "../widgets/layout/layout";
import { MainPage } from "../pages/main/main";
import { BookPage } from "../pages/book/book";
import { EventsPage } from "../pages/events/events";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppQueryProvider>
      <MantineProvider theme={theme} defaultColorScheme="light">
        <BrowserRouter>
          <Routes>
            <Route path="/theme-preview" element={<ThemePreview />} />
            <Route element={<Layout />}>
              <Route index element={<MainPage />} />
              <Route path="/book" element={<BookPage />} />
              <Route path="/events" element={<EventsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </MantineProvider>
    </AppQueryProvider>
  </StrictMode>,
);
