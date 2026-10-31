import { expect, test } from "@playwright/test";

test("owner creates a meeting type that guests can see", async ({ page }) => {
  await page.goto("/book");
  await page.getByRole("button", { name: "Создать тип", exact: true }).click();
  await expect(page.getByText("Введите название до 100 символов")).toBeVisible();
  await page.getByLabel("Название").focus();
  await expect(page.getByLabel("Название")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Описание")).toBeFocused();
  await page.getByLabel("Название").fill("Знакомство");
  await page.getByLabel("Описание").fill("Первый разговор");
  await page.getByLabel("Длительность в минутах").fill("30");
  await page.getByRole("button", { name: "Создать тип", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Знакомство" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Первый разговор")).toBeVisible();
  await expect(page.getByText("30 мин.")).toBeVisible();
});

test("guest selects a date and available time in UTC", async ({ page }) => {
  await page.goto("/book");
  await page.getByLabel("Название").fill("Встреча для записи");
  await page.getByLabel("Описание").fill("Обсуждение");
  await page.getByLabel("Длительность в минутах").fill("60");
  await page.getByRole("button", { name: "Создать тип", exact: true }).click();
  await page.getByRole("button", { name: "Выбрать Встреча для записи" }).click();
  const dates = page.getByRole("button", { name: /\d{4}-\d{2}-\d{2} · \d+ свободно/ });
  await expect(dates).toHaveCount(14);
  await page
    .getByRole("button", { name: /\d{4}-\d{2}-\d{2} · [1-9]\d* свободно/ })
    .first()
    .click();
  const slot = page.getByRole("button", { name: /^\d\d:\d\d UTC$/ }).first();
  await slot.click();
  await expect(slot).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Часовой пояс: UTC")).toBeVisible();
});

test("guest resolves a conflict without losing contacts and confirms a booking", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/meeting-types", {
    data: { name: "Конфликт", description: "Проверка", durationMinutes: 30 },
  });
  const type = await response.json();
  await page.goto("/book");
  await page.getByRole("button", { name: "Выбрать Конфликт" }).click();
  const dateButton = page
    .getByRole("button", { name: /\d{4}-\d{2}-\d{2} · (?:[2-9]|[1-9]\d+) свободно/ })
    .first();
  const date = (await dateButton.innerText()).slice(0, 10);
  await dateButton.click();
  const firstSlot = page.getByRole("button", { name: /^\d\d:\d\d UTC$/ }).first();
  const time = (await firstSlot.innerText()).slice(0, 5);
  await firstSlot.click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel("Имя").fill("Алиса");
  await page.getByLabel("Email").fill("alice@example.com");
  const other = await request.post("/api/bookings", {
    headers: { "Idempotency-Key": "e2e-conflict-attempt" },
    data: {
      meetingTypeId: type.id,
      meetingTypeVersion: type.version,
      startsAt: `${date}T${time}:00.000Z`,
      guestName: "Другой",
      guestEmail: "other@example.com",
    },
  });
  expect(other.status()).toBe(201);
  await page.getByRole("button", { name: "Подтвердить запись" }).click();
  await expect(page.getByRole("alert")).toContainText("Слот уже недоступен");
  await page
    .getByRole("button", { name: /^\d\d:\d\d UTC$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByLabel("Имя")).toHaveValue("Алиса");
  await expect(page.getByLabel("Email")).toHaveValue("alice@example.com");
  await page.getByRole("button", { name: "Подтвердить запись" }).click();
  await expect(page.getByRole("heading", { name: "Запись подтверждена" })).toBeVisible();
  await expect(page.getByText(/UTC/)).toBeVisible();
});

test("owner edits and confirms deletion of a meeting type", async ({ page }) => {
  await page.goto("/book");
  await page.getByLabel("Название").fill("Управление типом");
  await page.getByLabel("Описание").fill("Исходное описание");
  await page.getByLabel("Длительность в минутах").fill("30");
  await page.getByRole("button", { name: "Создать тип", exact: true }).click();
  await page.getByRole("button", { name: "Изменить Управление типом" }).click();
  await page.getByLabel("Название типа").fill("Обновлённый тип");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Обновлённый тип" })).toBeVisible();
  await page.getByRole("button", { name: "Удалить Обновлённый тип" }).click();
  await expect(page.getByText(/Новые записи станут недоступны/)).toBeVisible();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Обновлённый тип" })).toBeVisible();
  await page.getByRole("button", { name: "Удалить Обновлённый тип" }).click();
  await page.getByRole("button", { name: "Подтвердить удаление" }).click();
  await expect(page.getByRole("heading", { name: "Обновлённый тип" })).toHaveCount(0);
});
