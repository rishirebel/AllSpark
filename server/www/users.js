const API = require("../utils/api");
const commonFun = require("../utils/commonFunctions");
const constants = require('../utils/constants');
const getRole = (require('./object_roles')).get;
const dbConfig = require('config').get("sql_db");

exports.insert = class extends API {

	async insert() {

		this.user.privilege.needs('user.insert', "ignore");

		const alreadyExists = await this.mysql.query(
			'SELECT * FROM tb_users WHERE account_id = ? AND email = ?',
			[this.account.account_id, this.request.body.email]
		);

		if (alreadyExists.length)
			throw new API.Exception(400, 'User already exists');

		let password;

		if (this.request.body.password) {
			password = await commonFun.makeBcryptHash(this.request.body.password);
		}

		return await this.mysql.query(
			`INSERT INTO
				tb_users (account_id, email, first_name, last_name, middle_name, password, added_by)
			VALUES
				(?, ?, ?, ?, ?, ?, ?)
			`,
			[
				this.account.account_id,
				this.request.body.email,
				this.request.body.first_name,
				this.request.body.last_name,
				this.request.body.middle_name,
				password,
				this.user.user_id,
			],
			'write'
		);
	}

};

exports.delete = class extends API {

	async delete() {

		const [existingUser] = await this.mysql.query(`
			select
				*
			from
				tb_users
			where
				user_id = ?
				and status = 1
		`,
			[this.request.body.user_id]
		);

		this.assert(this.user.privilege.has('user.delete', 'ignore') || existingUser.added_by == this.user.user_id);

		return await this.mysql.query(`UPDATE tb_users SET status = 0 WHERE user_id = ?`, [this.request.body.user_id], 'write');

	}
}

exports.update = class extends API {

	async update() {
		const objRole = new getRole();

		const [existingUser] = await this.mysql.query(
			`select * from tb_users where user_id = ? and account_id = ?`,
			[this.request.body.user_id, this.account.account_id]
		);

		this.assert(existingUser, "User does not exists now.");

		if(existingUser.added_by != this.user.user_id) {

			const requiredCategories = (await objRole.get(this.account.account_id, 'user', 'role', this.request.body.user_id)).map(x => x.category_id[0]);

			if(requiredCategories.length) {

				this.assert(requiredCategories.some(x => this.user.privilege.has('user.update', x)), 'User does not have enough privileges');
			}
		}

		var keys = ['first_name', 'last_name', 'middle_name', 'phone', 'password', 'email', 'status'];

		const
			user_id = this.request.body.user_id,
			setParams = {};

		for (const key in this.request.body) {
			if (keys.includes(key))
				setParams[key] = this.request.body[key] || null;
		}

		if (setParams.password)
			setParams.password = await commonFun.makeBcryptHash(setParams.password);

		const values = [setParams, user_id];

		return await this.mysql.query(`UPDATE tb_users SET ? WHERE user_id = ?`, values, 'write');

	}

}

exports.list = class extends API {

	async list() {

		const possiblePrivileges = [constants.privilege["user.list"], constants.privilege["user"], constants.privilege["report"], constants.privilege["administrator"]];

		if (!this.request.body.user_id) {

			let flag = false;

			for (const p of possiblePrivileges) {

				flag = flag || this.user.privilege.has(p, "ignore");
			}

			this.assert(flag, "User does not have enough privileges to view user list");
		}

		let
			results,
			roles = {},
			privileges = {},
			db = dbConfig.write.database.concat('_logs'),
			user_query = `
				SELECT
					u.*,
					concat_ws(' ', addedByUser.first_name, addedByUser.middle_name, addedByUser.last_name) as added_by_user,
					max(s.created_at + INTERVAL 330 MINUTE) AS last_login
				FROM
					tb_users u
				LEFT JOIN
					tb_users addedByUser
				ON
					u.added_by = addedByUser.user_id
				LEFT JOIN
					${db}.tb_sessions s
				ON
					u.user_id = s.user_id
					AND s.type = 'login'
				WHERE
					u.account_id = ?
					AND u.status = 1
			`,
			role_query = `
				SELECT
					id,
					owner_id AS user_id,
					category_id,
					target_id AS role_id
				FROM
					tb_object_roles o
				JOIN
					tb_categories c
					USING(category_id)
				JOIN
					tb_roles r
				ON
					o.target_id = r.role_id
				WHERE
					OWNER = "user"
					AND target = "role"
					AND o.account_id = ?
				`,
			prv_query = `SELECT id, user_id, category_id, privilege_id FROM tb_user_privilege JOIN tb_privileges p USING(privilege_id) JOIN tb_categories USING(category_id) WHERE (p.account_id = ? OR p.account_id = 0 ) AND p.status = 1`
		;

		if (this.request.body.user_id && !this.request.body.search) {

			user_query = user_query.concat(' AND u.user_id = ?');
			role_query = role_query.concat(' AND owner_id = ?');
			prv_query = prv_query.concat(' AND user_id = ?');

			results = await Promise.all([
				this.mysql.query(user_query, [this.account.account_id, this.request.body.user_id]),
				this.mysql.query(role_query, [this.account.account_id, this.request.body.user_id]),
				this.mysql.query(prv_query, [this.account.account_id, this.request.body.user_id]),
			]);
		}

		else {

			let queryParams = [];

			if (this.request.body.search) {

				if (this.request.body.user_id) {

					user_query = user_query.concat(' AND u.user_id LIKE ?');
					queryParams.push(`%${this.request.body.user_id}%`);
				}

				if (this.request.body.email) {

					user_query = user_query.concat(` AND u.email LIKE ?`);
					queryParams.push(`%${this.request.body.email}%`);
				}

				if (this.request.body.name) {

					user_query = user_query.concat(` AND CONCAT(u.first_name, ' ', IFNULL(u.middle_name, ' '),' ', IFNULL(u.last_name, ' ')) LIKE ?`);
					queryParams.push(`%${this.request.body.name}%`);
				}


				if (this.request.query.text) {

					user_query = user_query.concat(`
						AND  (
							u.user_id LIKE ?
							OR u.phone LIKE ?
							OR u.email LIKE ?
							OR u.first_name LIKE ?
							OR u.middle_name LIKE ?
							OR u.last_name LIKE ?
						)
						LIMIT 10
					`);

					for (let i = 1; i <= 6; i++) {

						queryParams.push(`%${this.request.body.text}%`);
					}
				}
			}

			user_query = user_query.concat(' GROUP BY u.user_id');

			results = await Promise.all([
				this.mysql.query(user_query, [this.account.account_id, ...queryParams]),
				this.mysql.query(role_query, [this.account.account_id]),
				this.mysql.query(prv_query, [this.account.account_id]),
			]);
		}

		let userList = [];

		for (const role of results[1]) {

			if (this.request.body.category_id || this.request.body.role_id) {

				this.request.body.category_id = typeof this.request.body.category_id == 'string' ? [this.request.body.category_id] : this.request.body.category_id;
				this.request.body.role_id = typeof this.request.body.role_id == 'string' ? [this.request.body.role_id] : this.request.body.role_id;

				if (this.request.body.category_id) {

					const categoryCheck = this.request.body.category_id.includes(role.category_id.toString());

					if (!categoryCheck) {

						continue;
					}

					if (categoryCheck && this.request.body.search_by == 'privilege') {

						continue;
					}
				}

				if (this.request.body.role_id && !this.request.body.role_id.includes(role.role_id.toString())) {

					continue;
				}
			}

			if (!roles[role.user_id]) {

				roles[role.user_id] = [];
			}

			roles[role.user_id].push(role);
		}

		for (const privilege of results[2]) {

			if (this.request.body.category_id || this.request.body.privilege_id) {

				this.request.body.category_id = typeof this.request.body.category_id == 'string' ? [this.request.body.category_id] : this.request.body.category_id;
				this.request.body.privilege_id = typeof this.request.body.privilege_id == 'string' ? [this.request.body.privilege_id] : this.request.body.privilege_id;

				if (this.request.body.category_id) {

					const categoryCheck = this.request.body.category_id.includes(privilege.category_id.toString());

					if (!categoryCheck) {

						continue;
					}

					if (categoryCheck && this.request.body.search_by == 'role') {

						continue;
					}

				}

				if (this.request.body.privilege_id && !this.request.body.privilege_id.includes(privilege.privilege_id.toString())) {

					continue;
				}
			}

			if (!privileges[privilege.user_id]) {

				privileges[privilege.user_id] = [];
			}

			privileges[privilege.user_id].push(privilege);
		}

		for (const row of results[0]) {

			row.roles = roles[row.user_id] ? roles[row.user_id] : [];
			row.privileges = privileges[row.user_id] ? privileges[row.user_id] : [];
			row.href = `/user/profile/${row.user_id}`;
			row.superset = 'Users';
			row.name = [row.first_name, row.middle_name, row.last_name].filter(u => u).join(' ');
			row.last_login = row.last_login;

			if (this.request.query.search) {

				if (this.request.body.role_id && !roles[row.user_id]) {

					continue;
				}
				else if (this.request.body.privilege_id && !privileges[row.user_id]) {

					continue;
				}
				else if (this.request.body.category_id && !(roles[row.user_id] || privileges[row.user_id])) {

					continue;
				}
			}

			userList.push(row);
		}

		const userCategories = this.user.privileges.filter(x => possiblePrivileges.includes(x.privilege_name)).map(x => x.category_id);
		const userUpdateCategories = this.user.privileges.filter(x => [constants.privilege["user.update"], "user"].includes(x.privilege_name)).map(x => x.category_id);
		const deleteUserCategories = this.user.privileges.filter(x => [constants.privilege["user.delete"], "user"].includes(x.privilege_name)).map(x => x.category_id);

		if (!constants.adminCategory.some(x => userCategories.includes(x)) && !this.user.privilege.has('superadmin')) {

			userList = userList.filter(x => {

				const categories = x.roles.map(c => parseInt(c.category_id));

				return (categories.every(cat => userCategories.includes(parseInt(cat))) && categories.length) || x.added_by == this.user.user_id || x.user_id == this.user.user_id;
			});
		}

		for(const user of userList) {

			const categories = user.roles.map(u => parseInt(u.category_id));

			const updateFlag = userUpdateCategories.some(cat => categories.includes(parseInt(cat))) || user.added_by == this.user.user_id || this.user.privilege.has('superadmin');

			user.editable = constants.adminCategory.some(x => userCategories.includes(x) && this.user.privilege.has('user.update', x)) || updateFlag;

			const deleteFlag = deleteUserCategories.some(cat => categories.includes(parseInt(cat))) || user.added_by == this.user.user_id || this.user.privilege.has('superadmin');

			user.deletable = constants.adminCategory.some(x => userCategories.includes(x) && this.user.privilege.has('user.delete', x)) || deleteFlag;
		}

		return userList;
	}

};

exports.changePassword = class extends API {

	async changePassword() {

		const dbPass = await this.mysql.query(
			`SELECT password FROM tb_users WHERE user_id = ? and account_id = ?`,
			[this.user.user_id, this.account.account_id]
		);

		const check = await commonFun.verifyBcryptHash(this.request.body.old_password, dbPass[0].password);

		if (check) {

			const new_password = await commonFun.makeBcryptHash(this.request.body.new_password);

			return await this.mysql.query(
				`UPDATE tb_users SET password = ? WHERE user_id = ? and account_id = ?`,
				[new_password, this.user.user_id, this.account.account_id],
				'write'
			);

		}

		throw new API.Exception(400, 'Old Password does not match!');
	}
}

exports.metadata = class extends API {

	async metadata() {

		const [
			categoriesPrivilegesRoles,
			visualizations,
			globalFilters,
			sourceTypes,
			features,
			spatialMapThemes,
			datasources,
			locales
		] = await Promise.all([

			this.mysql.query(`
                SELECT
                    'categories' AS 'type',
                    category_id as owner_id,
                    \`name\`,
                    is_admin
                FROM
                    tb_categories
                WHERE
                    account_id = ?

                UNION ALL

                SELECT
                    'privileges' AS 'type',
                    privilege_id,
                    \`name\`,
                    ifnull(is_admin, 0) AS is_admin
                FROM
                    tb_privileges
                JOIN
                	tb_privileges_tree
                	USING(privilege_id)
                WHERE
                	(account_id = ? OR account_id = 0)

                UNION ALL

                SELECT
                    'roles',
                    role_id,
                    \`name\`,
                    ifnull(is_admin, 0) AS is_admin
                FROM
                    tb_roles
                WHERE
                    account_id = ?
            `,
				[this.account.account_id, this.account.account_id, this.account.account_id]
			),

			this.mysql.query(`
			SELECT
				v.*
			FROM
				tb_features f
			JOIN
				tb_account_features af
			ON
				f.feature_id = af.feature_id
				AND af.status = 1
				AND af.account_id = ?
				AND f.type = 'visualization'
			JOIN
				tb_visualizations v
			ON
				f.slug = v.slug
			`,
				[this.account.account_id]
			),

			this.mysql.query(
				'SELECT * FROM tb_global_filters WHERE account_id = ? AND is_enabled = 1 AND ISNULL(dashboard_id)',
				[this.account.account_id]
			),

			this.mysql.query(`
			SELECT
				f.slug
			FROM
				tb_features f
			JOIN
				tb_account_features af
			ON
				f.feature_id = af.feature_id
				AND af.status = 1
				AND f.type = 'source'
				AND af.account_id = ?
			`,
				[this.account.account_id]
			),
			this.mysql.query('SELECT * from tb_features'),

			this.mysql.query('select * from tb_spatial_map_themes'),

			this.mysql.query('select * from tb_datasources'),

			this.mysql.query("select * from tb_locales"),
		]);

		const metadata = {};

		for (const row of categoriesPrivilegesRoles) {

			if (!metadata[row.type]) {

				metadata[row.type] = [];
			}

			metadata[row.type].push(row);
		}

		metadata.globalFilters = globalFilters;
		metadata.filterTypes = constants.filterTypes;
		metadata.sourceTypes = sourceTypes;
		metadata.features = features;
		metadata.spatialMapThemes = spatialMapThemes;
		metadata.visualizations = visualizations;
		metadata.datasources = datasources;
		metadata.locales = locales;

		await this.user.settings.load();

		metadata.userSettings = [];

		for(const [key, value] of this.user.settings) {

			metadata.userSettings.push({key, value});
		}

		for (const data of metadata.globalFilters) {

			data.placeholder = data.placeholder.split(',');
		}

		return metadata;
	}
};