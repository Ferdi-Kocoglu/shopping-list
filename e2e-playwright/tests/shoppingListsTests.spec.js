const { test, expect } = require("@playwright/test");

test("Main page has expected title and the url.", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Shared shopping lists");
  await expect(page.locator("a")).toHaveText("Lists");
});

const listName = `list${Math.random()}`;
const itemName = `item${Math.random()}`;

test("Create a shopping list.", async ({ page }) => {
  await page.goto("/lists");
  await page.locator("input[type=text]").type(listName);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('ul')).toHaveCount(1);
  await expect(page.locator(`a >> text='${listName}'`)).toHaveText(listName);
});

test("Add a new item to the shopping list.", async ({ page }) => {
  await page.goto("/lists");
  await page.locator(`a >> text='${listName}'`).click();
  await expect(page.locator("h1")).toHaveText(listName);
  await expect(page.getByRole('button')).toHaveText("Add");
  await page.locator("input[type=text]").type(itemName);
  await page.getByRole('button', {name: "Add"}).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('listitem')).toContainText(itemName);
});

test("Mark an item as collected.", async ({ page }) => {
  await page.goto("/lists");
  await page.locator(`a >> text='${listName}'`).click();
  await expect(page.locator("h1")).toHaveText(listName);
  await page.getByRole('button', {name: "Mark collected!"}).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.locator('del')).toHaveText(itemName);
});

test("Deactivated list is not shown on the page", async ({ page }) => {
  await page.goto("/lists");
  await expect(page.locator(`a >> text='${listName}'`)).toBeVisible();
  await page.getByRole('button', {name: "Deactivate list!"}).click();
  await expect(page.locator(`a >> text='${listName}'`)).not.toBeVisible();
});
