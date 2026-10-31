// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { BookPage } from "./book";

window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
    addEventListener() {},
    removeEventListener() {},
  }) as MediaQueryList;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows the empty state and validates the creation form", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MantineProvider>
        <BookPage />
      </MantineProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Пока нет типов встреч")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Создать тип" }));
  expect(screen.getByText("Введите название до 100 символов")).toBeInTheDocument();
});

it("shows a retryable error when the list cannot be loaded", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MantineProvider>
        <BookPage />
      </MantineProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить типы встреч");
  expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
});
