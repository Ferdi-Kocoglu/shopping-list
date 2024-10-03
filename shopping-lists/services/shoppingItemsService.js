import { sql } from "../database/database.js"


const getShoppingItems = async (id) => {
	try {
		return await sql`SELECT * FROM shopping_list_items WHERE shopping_list_id = ${id} ORDER BY collected, name ASC;`;
	} catch (e) {
		console.log(e);
	}
	return false;
}

const addShoppingItem = async (listId, itemName) => {
	try {
		await sql`INSERT INTO shopping_list_items(shopping_list_id, name) VALUES(${listId}, ${itemName})`;
	} catch (e) {
		console.log(e);
	}
}

const collectShoppingItem = async (itemId) => {
	try {
		await sql`UPDATE shopping_list_items SET collected = true WHERE id = ${itemId}`;
	} catch (e) {
		console.log(e);
	}
}

const getShoppingItemsCount = async () => {
	try {
		const rows = await sql`SELECT COUNT(id) as count FROM shopping_list_items`;
		if (rows && rows[0].count) {
			return rows[0].count;
		}
	} catch (e) {
		console.log(e);
	}
	return 0;
}

export { getShoppingItems, addShoppingItem, collectShoppingItem, getShoppingItemsCount }