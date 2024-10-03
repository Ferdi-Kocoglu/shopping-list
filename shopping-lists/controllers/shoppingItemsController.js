import { renderFile } from "../deps.js"
import * as requestUtils from "../utils/requestUtils.js";
import * as shoppingItemsService from "../services/shoppingItemsService.js"

const addShoppingItem = async (request) => {
	const url = new URL(request.url);
	const pathParts = url.pathname.split("/");
	const listId = pathParts[2];
	const formData = await request.formData();
	await shoppingItemsService.addShoppingItem(listId, formData.get("name"));
	return requestUtils.redirectTo(`/lists/${listId}`);
};

const collectShoppingItem = async (request) => {
	const url = new URL(request.url);
	const pathParts = url.pathname.split("/");
	const itemId = pathParts[4];
	await shoppingItemsService.collectShoppingItem(itemId);
	return requestUtils.redirectTo(`/lists/${pathParts[2]}`);
}

export { addShoppingItem, collectShoppingItem };