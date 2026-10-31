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

it("keeps contacts when returning to slot selection and confirms the booking", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      let data: unknown;
      if (url.endsWith("/availability"))
        data = { version: 1, days: [{ date: "2026-11-02", availableCount: 1 }] };
      else if (url.includes("/slots?"))
        data = {
          version: 1,
          slots: [
            {
              startsAt: "2026-11-02T09:00:00.000Z",
              endsAt: "2026-11-02T10:00:00.000Z",
              available: true,
            },
          ],
        };
      else if (url.endsWith("/bookings")) {
        expect(new Headers(init?.headers).get("idempotency-key")).toBeTruthy();
        data = {
          id: "booking",
          meetingTypeName: "Call",
          startsAt: "2026-11-02T09:00:00.000Z",
          endsAt: "2026-11-02T10:00:00.000Z",
          guestName: "Alice",
          guestEmail: "a@example.com",
        };
      } else
        data = [{ id: "one", name: "Call", description: "Intro", durationMinutes: 60, version: 1 }];
      return new Response(JSON.stringify(data), {
        status: url.endsWith("/bookings") ? 201 : 200,
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
  fireEvent.click(await screen.findByRole("button", { name: "09:00 UTC" }));
  fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
  fireEvent.change(screen.getByLabelText(/Имя/), { target: { value: "Alice" } });
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "a@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Изменить время" }));
  fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
  expect(screen.getByLabelText(/Имя/)).toHaveValue("Alice");
  fireEvent.click(screen.getByRole("button", { name: "Подтвердить запись" }));
  expect(await screen.findByText("Запись подтверждена")).toBeInTheDocument();
});

it("restores an unknown booking attempt, retries the same key and clears it on success", async () => {
  const attempt = {
    key: "secret-key",
    input: {
      meetingTypeId: "one",
      meetingTypeVersion: 1,
      startsAt: "2026-11-02T09:00:00.000Z",
      guestName: "Alice",
      guestEmail: "a@example.com",
    },
  };
  sessionStorage.setItem("calendar-booking-attempt", JSON.stringify(attempt));
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith("/bookings")) {
      expect(new Headers(init?.headers).get("idempotency-key")).toBe(attempt.key);
      expect(JSON.parse(String(init?.body))).toEqual(attempt.input);
      return new Response(
        JSON.stringify({
          meetingTypeName: "Call",
          startsAt: attempt.input.startsAt,
          endsAt: "2026-11-02T10:00:00.000Z",
        }),
        { status: 201 },
      );
    }
    return new Response("[]", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <BookPage />
      </MantineProvider>
    </QueryClientProvider>,
  );
  expect(screen.getByText(/повтор может впервые создать запись/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Повторить попытку" }));
  expect(await screen.findByText("Запись подтверждена")).toBeInTheDocument();
  expect(sessionStorage.getItem("calendar-booking-attempt")).toBeNull();
});

it("keeps an unknown attempt after 503 and requires confirmation before forgetting it", async () => {
  const attempt = {
    key: "secret-key",
    input: {
      meetingTypeId: "one",
      meetingTypeVersion: 1,
      startsAt: "2026-11-02T09:00:00.000Z",
      guestName: "Alice",
      guestEmail: "a@example.com",
    },
  };
  sessionStorage.setItem("calendar-booking-attempt", JSON.stringify(attempt));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith("/bookings")
        ? new Response(JSON.stringify({ code: "DATABASE_BUSY", message: "busy" }), { status: 503 })
        : new Response("[]", { status: 200 }),
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
  fireEvent.click(screen.getByRole("button", { name: "Повторить попытку" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Результат неизвестен");
  expect(sessionStorage.getItem("calendar-booking-attempt")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Забыть попытку" }));
  expect(screen.getByText(/Запись может существовать и не отменяется/)).toHaveTextContent(
    "Новая попытка может создать вторую запись",
  );
  expect(sessionStorage.getItem("calendar-booking-attempt")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Подтвердить забывание" }));
  expect(sessionStorage.getItem("calendar-booking-attempt")).toBeNull();
  expect(await screen.findByText("Пока нет типов встреч")).toBeInTheDocument();
});
