const API = require("../utils/api");
const account = require('../onServerStart');
const commonFun = require("../utils/commonFunctions");
const redis = require("../utils/redis").Redis;
const getRole = (require('./object_roles')).get;
const settingHistory = require('../utils/reportLogs');

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
		this.assert(commonFun.isJson(value), 'Please send valid JSON');

		const
			insertResponse = await this.mysql.query(
				`INSERT INTO
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
				'write'
			),
			[loggedRow] = await this.mysql.query('SELECT * FROM tb_settings WHERE id = ?', [insertResponse.insertId]),
			logs = {
				owner: 'setting',
				owner_id: insertResponse.insertId,
				state: JSON.stringify(loggedRow),
				operation: 'insert',
			}
		;

		settingHistory.insert(this, logs);

		return insertResponse
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

		const
			[rowUpdated] = await this.mysql.query('SELECT * FROM tb_settings WHERE id = ?', [id], 'write'),
			compareJSON = {
				profile: rowUpdated.profile,
				value: commonFun.isJson(rowUpdated.value) ? JSON.parse(rowUpdated.value) : []
			};

		if(JSON.stringify(compareJSON, 0, 4) == JSON.stringify({profile, value: JSON.parse(value)}, 0, 4)) {

			return 'New values are identical to the previous ones.';
		}

		rowUpdated.profile = profile;
		rowUpdated.value = value;

		const
			response = await this.mysql.query(
				"UPDATE tb_settings SET profile = ?, value = ? WHERE id = ?",
				[profile || null, value, id],
				"write"
			),
			logs = {
				owner: 'setting',
				owner_id: id,
				state: JSON.stringify(rowUpdated),
				operation: 'update',
			};

		settingHistory.insert(this, logs);

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

		const
			[rowDeleted] = await this.mysql.query('SELECT * FROM tb_settings WHERE id = ?', [id], 'write'),
			deleteResponse = await this.mysql.query("DELETE FROM tb_settings WHERE id = ?", [id], 'write')
		;

		settingHistory.insert(
			this,
			{
				owner: 'setting',
				owner_id: id,
				state: JSON.stringify(rowDeleted),
				operation: 'delete',
			}
		);

		return deleteResponse;
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

