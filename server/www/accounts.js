const API = require('../utils/api.js');
const account = require('../onServerStart');
const commonFun = require("../utils/commonFunctions");
const redis = require("../utils/redis").Redis;
const config = require('config');
const constants = require("../utils/constants");
const syncServer = require('../utils/sync-server');

exports.list = class extends API {

	async list() {

		this.user.privilege.needs('administrator');

		const accountList = await this.mysql.query(`
			SELECT
				a.*,
				s.profile,
				s.value,
				group_concat(distinct f.feature_id) as features
			FROM
				tb_accounts a
			LEFT JOIN
				tb_settings s
			ON
				s.owner_id = a.account_id
				AND s.owner = 'account'
			LEFT JOIN
				tb_account_features f
			ON
				a.account_id = f.account_id
				AND f.status = 1
			WHERE
				a.status = 1
			GROUP BY
				profile, account_id, value
		`);

		this.assert(accountList.length, "No Account found");
		const accountObj = {};

		accountList.map(x => {

			if (!accountObj[x.account_id]) {

				accountObj[x.account_id] = JSON.parse(JSON.stringify(x));
			}

			delete accountObj[x.account_id]['profile'];
			delete accountObj[x.account_id]['value'];
			delete accountObj[x.account_id]['features'];

			if (!accountObj[x.account_id].settings) {

				accountObj[x.account_id].settings = [];
			}

			accountObj[x.account_id].settings.push({
				profile: x.profile,
				value: JSON.parse(x.value),
			});


			accountObj[x.account_id].features = (x.features || '').split(',').filter(x => x);
		});

		return Object.values(accountObj);
	}
};

exports.get = class extends API {

	async get() {

		const accountList = await this.mysql.query(`
			SELECT
				a.*,
				s.profile,
				s.value,
				group_concat(distinct f.feature_id) as features
			FROM
				tb_accounts a
			LEFT JOIN
				tb_settings s
			ON
				s.owner_id = a.account_id
				AND s.owner = 'account'
				AND s.status = 1
				AND s.profile = 'main'
			LEFT JOIN
				tb_account_features f
			ON
				a.account_id = f.account_id
				AND f.status = 1
			WHERE
				a.status = 1
				and a.account_id = ?
			`,
			[this.account.account_id]);

		this.assert(accountList.length, "Account not found!");

		const account = {
			settings: [],
			features: [],
		};

		Object.assign(account, accountList[0]);

		accountList.map(a => {

			try {
				account.settings = JSON.parse(a.value);
				account.features = (a.features || '').split(',').filter(a => parseInt(a));
			}
			catch (e) {
			}
		});

		delete account.value;
		delete account.profile;

		return {...account, url: account.url.split(',').filter(x => x.trim())};
	}
};

exports.insert = class extends API {

	async insert({name, url, icon = null, logo = null, auth_api = null}) {

		this.user.privilege.needs('superadmin');

		const result = await this.mysql.query(
			'INSERT INTO tb_accounts SET ?',
			{name, url, icon, logo, auth_api},
			'write'
		);

		this.assert(result.insertId, 'Account not inserted');

		const [category, role] = await Promise.all([

			this.mysql.query(
				'INSERT INTO tb_categories (account_id, name, slug, is_admin) VALUES(?, "Main", "main", 1)',
				[result.insertId],
				'write'
			),

			this.mysql.query(
				'INSERT INTO tb_roles (account_id, name, is_admin) VALUES (?, "Main", 1)',
				[result.insertId],
				'write'
			)
		]);

		await syncServer.set(`${constants.lastUpdatedKeys.account}`);

		await account.loadAccounts();

		return {
			account_id: result.insertId,
			category_id: category.insertId,
			role_id: role.insertId,
		};
	}
}

exports.update = class extends API {

	async update({account_id, name, url, icon = null, logo = null, auth_api = null}) {

		this.user.privilege.needs('superadmin');

		const result = await this.mysql.query(
			'UPDATE tb_accounts SET ? WHERE account_id = ?',
			[{name, url, icon, logo, auth_api}, account_id],
			'write'
		);

		await syncServer.set(`${constants.lastUpdatedKeys.account}`);

		await account.loadAccounts();
		return result;
	}
}

exports.delete = class extends API {

	async delete({account_id}) {

		this.user.privilege.needs('superadmin');

		const result = await this.mysql.query(
			'UPDATE tb_accounts SET status = 0 WHERE account_id = ?',
			[account_id],
			'write'
		);

		await this.mysql.query(
			"update tb_settings set status = 0 where owner_id = ? and owner = 'account'",
			[account_id],
			"write"
		);

		await syncServer.set(`${constants.lastUpdatedKeys.account}`);

		await account.loadAccounts();
		return result;
	}
};


exports.userQueryLogs = class extends API {

	async userQueryLogs() {

		const logsExists = this.account.settings.get('load_saved_database');

		if (parseInt(logsExists)) {

			return "setup already done"
		}

		this.assert(this.account.settings.get('load_saved_connection'), "connection id not found");

		const [resultLogCredentials] = await this.mysql.query(
			"select * from tb_credentials where id = ? and status = 1",
			[this.account.settings.get('load_saved_connection')]
		);

		this.assert(resultLogCredentials, "Credential not found");

		return await this.initialSetup(resultLogCredentials);
	}

	async initialSetup(credentials) {

		let db = await this.mysql.query("show databases", [], credentials.id);

		if (!db.some(x => x['Database'] === (credentials.db || constants.saveQueryResultDb))) {

			await this.mysql.query(
				`CREATE DATABASE IF NOT EXISTS ${credentials.db || constants.saveQueryResultDb}`,
				[],
				credentials.id
			);
		}

		await this.mysql.query(`
			CREATE TABLE IF NOT EXISTS ??.?? (
			  \`id\` int(11) unsigned NOT NULL AUTO_INCREMENT,
			  \`query_id\` int(11) DEFAULT NULL,
			  \`type\` varchar(20) DEFAULT NULL,
			  \`user_id\` int(11) DEFAULT NULL,
			  \`query\` text,
			  \`data\` longblob,
			  \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
			  \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			  PRIMARY KEY (\`id\`),
			  KEY \`query_id\` (\`query_id\`),
			  KEY \`type\` (\`type\`),
			  KEY \`user_id\` (\`user_id\`),
			  KEY \`created_at\` (\`created_at\`)
			) ENGINE=InnoDB DEFAULT CHARSET=latin1;`,
			[credentials.db || constants.saveQueryResultDb, constants.saveQueryResultTable],
			credentials.id,
		);

		if (!credentials.db) {

			await this.mysql.query(
				`update tb_credentials set db = ? where id = ?`,
				[credentials.db || constants.saveQueryResultDb, credentials.id],
				"write"
			);
		}

		return credentials.db || constants.saveQueryResultDb
	}
};

exports.signup = class extends API {

	async signup() {

		if (!this.account.settings.get("enable_account_signup")) {
			throw new API.Exception(400, 'Account Signup restricted!');
		}

		const account_obj = Object.assign(new exports.insert(), this);
		let account_res;

		try {
			account_res = await account_obj.insert();
		}
		catch (e) {

			throw new API.Exception(400, "Account not created")
		}

		const password = await commonFun.makeBcryptHash(this.request.body.password);

		const user = await this.mysql.query(
			`INSERT INTO tb_users (account_id, first_name, middle_name, last_name, email, password, phone)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				account_res.account_id,
				this.request.body.first_name,
				this.request.body.middle_name,
				this.request.body.last_name,
				this.request.body.email,
				password,
				this.request.body.phone
			],
			'write'
		);


		await Promise.all([
			this.mysql.query(
				`INSERT INTO
					tb_object_roles
					(account_id, owner, owner_id, target, target_id, category_id)
					VALUES (?, ?, ?)
				`,
				[account_res.account_id, "user", user.insertId, "role", account_res.role_id, account_res.category_id]
				, 'write'
			),
			this.mysql.query(`INSERT INTO tb_user_privilege (user_id, category_id, privilege_id) VALUES (?, ?, 1)`, [user.insertId, account_res.category_id], 'write'),
		]);

		return "User signup successful";
	}
}