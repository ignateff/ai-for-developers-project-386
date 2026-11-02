import { expect, test } from "@playwright/test";

test("conflicted slots remain blocked during refresh and after an error until retry succeeds", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Добавить тип встречи" }).click();
  await page.getByLabel("Название").fill("Конфликт слота");
  await page.getByLabel("Описание").fill("Проверка обновления");
  await page.getByLabel("Длительность в минутах").fill("30");
  await page.getByRole("button", { name: "Создать тип", exact: true }).click();
  await page.getByRole("link", { name: "Гость" }).click();
  await page.getByRole("button", { name: "Выбрать Конфликт слота" }).click();
  await page
    .getByRole("button", { name: /\d{4}-\d{2}-\d{2} · (?:[2-9]|[1-9]\d+) свободно/ })
    .first()
    .click();
  const slot = page.getByRole("button", { name: /^\d\d:\d\d UTC$/ }).first();
  const slotName = await slot.innerText();
  await slot.click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel("Имя").fill("Гость");
  await page.getByLabel("Email").fill("guest@example.com");
  await page.route("**/api/bookings", async (route) => {
    expect((await route.fetch()).status()).toBe(201);
    await route.fulfill({
      status: 409,
      json: { code: "SLOT_UNAVAILABLE", message: "Slot unavailable" },
    });
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/slots?*",
    async (route) => {
      await held;
      await route.fulfill({ status: 500, json: {} });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Подтвердить запись" }).click();
  await expect(page.getByText("Слот уже недоступен. Выберите другое время.")).toBeVisible();
  const oldSlot = page.getByRole("button", { name: slotName.replace(/\s+/g, " ").trim() });
  await expect(oldSlot).toBeDisabled();
  release();
  await expect(page.getByText("Не удалось загрузить слоты.")).toBeVisible();
  await expect(oldSlot).toBeDisabled();
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(
    page.getByRole("button", { name: `${slotName.replace(/\s+/g, " ").trim()} Занято` }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: /^\d\d:\d\d UTC$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByLabel("Имя")).toHaveValue("Гость");
  await expect(page.getByLabel("Email")).toHaveValue("guest@example.com");
});

test("a response for another date does not unlock the conflicted date", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Добавить тип встречи" }).click();
  await page.getByLabel("Название").fill("Переключение даты");
  await page.getByLabel("Описание").fill("Проверка обновления");
  await page.getByLabel("Длительность в минутах").fill("30");
  await page.getByRole("button", { name: "Создать тип", exact: true }).click();
  await page.getByRole("link", { name: "Гость" }).click();
  await page.getByRole("button", { name: "Выбрать Переключение даты" }).click();
  const days = page.getByRole("button", { name: /\d{4}-\d{2}-\d{2} · [1-9]\d* свободно/ });
  const firstDay = (await days.first().getAttribute("aria-label"))!.slice(0, 10);
  const secondDay = (await days.nth(1).getAttribute("aria-label"))!.slice(0, 10);
  await days.first().click();
  await page
    .getByRole("button", { name: /^\d\d:\d\d UTC$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel("Имя").fill("Гость");
  await page.getByLabel("Email").fill("guest@example.com");
  await page.route("**/api/bookings", (route) =>
    route.fulfill({ status: 409, json: { code: "SLOT_UNAVAILABLE", message: "Conflict" } }),
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/slots?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("date") === firstDay) await held;
    await route.continue();
  });
  await page.getByRole("button", { name: "Подтвердить запись" }).click();
  await expect(page.getByText("Обновление слотов…")).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`^${secondDay} ·`) }).click();
  await expect(page.getByRole("button", { name: /^\d\d:\d\d UTC$/ }).first()).toBeEnabled();
  await page.getByRole("button", { name: new RegExp(`^${firstDay} ·`) }).click();
  await expect(page.getByRole("button", { name: /^\d\d:\d\d UTC$/ }).first()).toBeDisabled();
  release();
  await expect(page.getByRole("button", { name: /^\d\d:\d\d UTC$/ }).first()).toBeEnabled();
});
