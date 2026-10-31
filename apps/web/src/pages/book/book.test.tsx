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

it("lets a guest select an available slot but not an occupied one", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.endsWith("/availability")
        ? { version: 1, days: [{ date: "2026-11-02", availableCount: 1 }] }
        : url.includes("/slots?")
          ? {
              version: 1,
              slots: [
                {
                  startsAt: "2026-11-02T09:00:00.000Z",
                  endsAt: "2026-11-02T10:00:00.000Z",
                  available: true,
                },
                {
                  startsAt: "2026-11-02T10:00:00.000Z",
                  endsAt: "2026-11-02T11:00:00.000Z",
                  available: false,
                },
              ],
            }
          : [{ id: "one", name: "Call", description: "Intro", durationMinutes: 60, version: 1 }];
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
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
  fireEvent.click(await screen.findByRole("button", { name: "Выбрать Call" }));
  fireEvent.click(await screen.findByRole("button", { name: /2026-11-02/ }));
  expect(await screen.findByRole("button", { name: /10:00.*Занято/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "09:00 UTC" }));
  expect(screen.getByRole("button", { name: "09:00 UTC" })).toHaveAttribute("aria-pressed", "true");
});

it("accepts Unicode code points at the length limits and rejects values above them", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MantineProvider>
        <BookPage />
      </MantineProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("Пока нет типов встреч");
  const name = screen.getByLabelText(/Название/);
  const description = screen.getByLabelText(/Описание/);
  fireEvent.change(name, { target: { value: "😀".repeat(100) } });
  fireEvent.change(description, { target: { value: "😀".repeat(1000) } });
  fireEvent.change(screen.getByLabelText(/Длительность в минутах/), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Создать тип" }));
  expect(screen.queryByText("Введите название до 100 символов")).not.toBeInTheDocument();
  expect(screen.queryByText("Введите описание до 1000 символов")).not.toBeInTheDocument();
  await screen.findByRole("alert");
  fireEvent.change(name, { target: { value: "😀".repeat(101) } });
  fireEvent.change(description, { target: { value: "😀".repeat(1001) } });
  fireEvent.click(screen.getByRole("button", { name: "Создать тип" }));
  expect(screen.getByText("Введите название до 100 символов")).toBeInTheDocument();
  expect(screen.getByText("Введите описание до 1000 символов")).toBeInTheDocument();
});
