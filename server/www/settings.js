const API = require("../utils/api");
const account = require('../onServerStart');
const commonFun = require("../utils/commonFunctions");
const redis = require("../utils/redis").Redis;
const getRole = (require('./object_roles')).get;

exports.insert = class extends API {

	async insert({profile, owner, value, owner_id} = {}) {

		let account_id;

		if(owner == 'account') {
			this.user.privilege.needs("superadmin");
			account_id = null;
		}
		else if(owner == 'user') {
			this.assert(owner_id == this.user.user_id, 'You cannot insert settings for user other than you.');
			account_id = owner_id;
		}

		this.assert(profile, "profile not found");
		this.assert(owner, "owner not found");
		this.assert(owner_id, `${owner} not found`);
		this.assert(commonFun.isJson(value), "Please send valid JSON");

		return await this.mysql.query(`
				INSERT INTO
					tb_settings
					(
						account_id,
						profile,
						owner,
						owner_id,
						value
					)
				VALUES
					(?, ?, ?, ?, ?)
				`,
			[account_id, profile, owner, owner_id, value],
			"write");
	}
};

exports.update = class extends API {

	async update({id, value, profile, owner, owner_id} = {}) {

		if(owner == 'account') {
			this.user.privilege.needs("superadmin");
		}

		if(owner == 'user') {
			await redis.del(`user.settings.${this.user.user_id}`);
		}

		if(owner == 'user' && !this.user.privilege.has('superadmin') && this.user.user_id != owner_id) {

			const objRole = new getRole();

			const requiredCategories = (await objRole.get(this.account.account_id, 'user', 'role', owner_id)).map(x => x.category_id[0]);

			this.assert(requiredCategories.length, 'No categories found');

			this.assert(requiredCategories.every(x => ['user.update', 'administrator'].map(p => this.user.privilege.has(p, x))), 'User does not have enough privileges to update');
		};

		this.assert(id, "no id found to update");
		this.assert(commonFun.isJson(value), "Please send valid JSON");

		const response = await this.mysql.query(
			"UPDATE tb_settings SET profile = ?, value = ? WHERE id = ?",
			[profile || null, value, id],
			"write"
		);

		if(owner == 'account') {

			await account.loadAccounts();
		}

		return response;
	}
};

exports.delete = class extends API {

	async delete({id, owner_id, owner} = {}) {

		this.assert(id, "No id found to delete");

		if(owner == 'user') {
			await redis.del(`user.settings.${this.user.user_id}`);
		}

		if(owner == 'user' && !this.user.privilege.has('superadmin') && this.user.user_id != owner_id) {

			const objRole = new getRole();

			const requiredCategories = (await objRole.get(this.account.account_id, 'user', 'role', owner_id)).map(x => x.category_id[0]);

			this.assert(requiredCategories.length, 'No categories found');

			this.assert(requiredCategories.every(x => ['user.delete', 'administrator'].map(p => this.user.privilege.has(p, x))), 'User does not have enough privileges to delete');
		};

		await account.loadAccounts();

		return await this.mysql.query("DELETE FROM tb_settings WHERE id = ?", [id], "write");
	}
};

exports.list = class extends API {

	async list({owner, owner_id} = {}) {

		if(owner == 'account') {
			this.user.privilege.needs("superadmin");
		}

		this.assert(owner && owner_id, 'Owner or Owner_id not found');

		const settingsList = await this.mysql.query("select * from tb_settings where status = 1 and owner = ? and owner_id = ?", [owner, owner_id]);

		for(const row of settingsList) {
			try {
				row.value = JSON.parse(row.value);
			}
			catch(e) {}
		}

		await account.loadAccounts();

		return settingsList;
	}
};

