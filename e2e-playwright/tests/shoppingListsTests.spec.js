const { test, expect } = require("@playwright/test");

test("Main page has expected title and link.", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Shared shopping lists");
    await expect(page.locator("a")).toHaveText("Lists");
});

const listName = `list${Math.random()}`;
const itemName = `item${Math.random()}`;

test("Can create a list.", async ({ page }) => {
  await page.goto("/lists");
  await page.locator("input[type=text]").type(listName);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('ul')).toHaveCount(1);
  await expect(page.locator(`a >> text='${listName}'`)).toHaveText(listName);
});

test("Can open a list page and the list is empty.", async ({ page }) => {
  await page.goto("/lists");
  await page.locator(`a >> text='${listName}'`).click();
  await expect(page.locator("h1")).toHaveText(listName);
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test("Can create an item.", async ({ page }) => {
  await page.goto("/lists");
  await page.locator(`a >> text='${listName}'`).click();
  await expect(page.locator("h1")).toHaveText(listName);
  await expect(page.getByRole('button')).toHaveText("Add");
  await page.locator("input[type=text]").type(itemName);
  await page.getByRole('button', {name: "Add"}).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('listitem')).toContainText(itemName);
});

test("Can collect an item.", async ({ page }) => {
  await page.goto("/lists");
  await page.locator(`a >> text='${listName}'`).click();
  await expect(page.locator("h1")).toHaveText(listName);
  await page.getByRole('button', {name: "Mark collected!"}).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.locator('del')).toHaveText(itemName);
});

test("Items are in alphabetical order, active first", async ({ page }) => {
  await page.goto("/lists");
  await page.locator(`a >> text='${listName}'`).click();
  await expect(page.locator("h1")).toHaveText(listName);
  await expect(page.getByRole('button')).toHaveText("Add");
  const itemsList = ['juice', 'apples', 'tomatoes', 'bananas', 'cheese', 'bread'];
  for (const item of itemsList) {
      await page.locator("input[type=text]").type(item);
      await page.getByRole('button', {name: "Add"}).click();
      await expect(page.locator(`li >> text='${item}'`)).toBeVisible();
  };
  // There is already one item in the list (itemName) and it's collected, 
  // that's why we expect, that there are itemList.length + 1 in the list
  // and itemName is in the end of the list.
  await expect(page.locator('ul > li')).toHaveCount(itemsList.length + 1);
  const resultItemList = itemsList.sort();
  resultItemList.push(itemName);
  await expect(page.locator('ul > li')).toContainText(resultItemList);
});

test("Deactivated list is not shown on the page", async ({ page }) => {
  await page.goto("/lists");
  await expect(page.locator(`a >> text='${listName}'`)).toBeVisible();
  await page.getByRole('button', {name: "Deactivate list!"}).click();
  await expect(page.locator(`a >> text='${listName}'`)).not.toBeVisible();
});
