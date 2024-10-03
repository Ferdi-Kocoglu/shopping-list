import { renderFile } from "../deps.js"
import * as requestUtils from "../utils/requestUtils.js";
import * as shoppingListsService from "../services/shoppingListsService.js"
import * as shoppingItemsService from "../services/shoppingItemsService.js"

const responseDetails = {
  headers: { "Content-Type": "text/html;charset=UTF-8" },
};

const getStatistics = async (request) => {
    const data = {
      shoppingListsCount: await shoppingListsService.getShoppingListsCount(), 
      shoppingItemsCount: await shoppingItemsService.getShoppingItemsCount(),
    };
    return new Response(await renderFile("index.eta", data), responseDetails);
};

const getActiveShoppingLists = async (request) => {
  const data = {
    shoppingLists: await shoppingListsService.getActiveShoppingLists(),
  };
  return new Response(await renderFile("shoppingLists.eta", data), responseDetails);
};

const addShoppingList = async (request) => {
  const formData = await request.formData();
  await shoppingListsService.addShoppingList(formData.get("name"));
  return requestUtils.redirectTo("/lists");
};

const deactivateShoppingList = async (request) => {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  await shoppingListsService.deactivateById(pathParts[2]);
  return requestUtils.redirectTo("/lists");
};

const viewShoppingList = async (request) => {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[2];

  const data = {
    shoppingList: await shoppingListsService.getShoppingListById(id),
    shoppingItems: await shoppingItemsService.getShoppingItems(id),
  };
  return new Response(await renderFile("shoppingItems.eta", data), responseDetails);
};

export { getStatistics, getActiveShoppingLists, addShoppingList, deactivateShoppingList, viewShoppingList };
