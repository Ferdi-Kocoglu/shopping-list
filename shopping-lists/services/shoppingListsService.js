import { sql } from "../database/database.js"

const getActiveShoppingLists = async () => {
	try {
		return await sql`SELECT * FROM shopping_lists WHERE active = true`;
	} catch (e) {
		console.log(e);
	};
};

const addShoppingList = async (name) => {
	try {
		await sql`INSERT INTO shopping_lists(name) VALUES (${name})`;
	} catch (e) {
		console.log(e);
	};
};

const deactivateById = async (id) => {
	try {
		await sql`UPDATE shopping_lists SET active = false WHERE id = ${id}`;
	} catch (e) {
		console.log(e);
	};
};

const getShoppingListById = async (id) => {
	try {
		const rows = await sql`SELECT * FROM shopping_lists WHERE id = ${id}`;
		if (rows && rows.length > 0) {
			return rows[0];
		}
	} catch (e) {
		console.log(e);
	}
	return false;
};

const getShoppingListsCount = async () => {
	try {
		const rows = await sql`SELECT COUNT(id) as count FROM shopping_lists`;
		if (rows && rows[0].count) {
			return rows[0].count;
		}
	} catch (e) {
		console.log(e);
	}
	return 0;
}

export { getActiveShoppingLists, addShoppingList, deactivateById, getShoppingListById, getShoppingListsCount };