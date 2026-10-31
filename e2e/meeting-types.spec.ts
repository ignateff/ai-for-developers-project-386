import { expect, test } from "@playwright/test";

test("owner creates a meeting type that guests can see", async ({ page }) => {
  await page.goto("/book");
  await expect(page.getByText("Пока нет типов встреч")).toBeVisible();
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
