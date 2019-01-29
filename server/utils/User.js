const constants = require("./constants");
const config = require("config");
const mysql = require('./mysql').MySQL;
const redis = require("./redis").Redis;

class User {

	constructor(userObj) {

		Object.assign(this, userObj);

		this.privilege = privilege(userObj);
		this.role = roles(userObj);
		this.settings = new Settings(this);
	}

	get json() {

		return {
			user_id: this.user_id,
			account_id: this.account_id,
			email: this.email,
			name: this.name,
			roles: this.roles,
			privileges: this.privileges,
			session_id: this.session_id,
			settings: Array.from(this.settings),
			exp: this.exp,
			iat: this.iat,
		};
	}
}

class Settings extends Map {

	constructor(user) {

		super();

		this.user = user;
	}

	async load() {

		let userSetting = await redis.hget(`user.settings.${this.user.user_id}`, 'main');

		if(!userSetting) {

			[{value: userSetting} = {}] =
				await mysql.query(`
					SELECT
						s.*
					FROM
						tb_settings_copy s
					JOIN
						tb_users u
					ON
						s.owner_id = u.user_id
					WHERE
						s.status = 1
						AND u.status = 1
						AND s.owner = 'user'
						AND s.owner_id = ?
					LIMIT 1
					`,
					[this.user.user_id]
				);

			if(!userSetting) {
				return;
			}

			await redis.hset(`user.settings.${this.user.user_id}`, 'main', userSetting);
		}

		try {

			for(const data of JSON.parse(userSetting)) {
				this.set(data.key, data.value);
			}
		}
		catch(e) {}
	}

	async get(key) {

		if(!this.has(key)) {
			await this.load();
		}

		return super.get(key);
	}
}

function privilege(userObj) {

	return {

		has: function (privilegeName, categoryId = 0) {

			if (config.has('privilege_ignore') && config.get('privilege_ignore')) {
				return true;
			}

			const isSuperAdmin = userObj.privileges.filter(x => x.privilege_name == "superadmin").length;


			if (privilegeName === "superadmin") {

				return isSuperAdmin;
			}

			if(isSuperAdmin) {

				return true;
			}

			if (userObj.error) {

				throw(userObj.message);
			}

			const ignoreCategoryFlag = constants.privilege.ignore_category.includes(privilegeName) || categoryId == 'ignore';
			const ignorePrivilegeFlag = constants.privilege.ignore_privilege.includes(privilegeName);

			for (const userPrivilege of userObj.privileges) {

				if ((ignorePrivilegeFlag || userPrivilege.privilege_name === constants.privilege[privilegeName] || constants.adminRole.includes(userPrivilege.privilege_id)) && (categoryId === userPrivilege.category_id || constants.adminCategory.includes(userPrivilege.category_id) || ignoreCategoryFlag)) {

					return true;
				}
			}

			return !userObj.privileges.length && ignorePrivilegeFlag && ignoreCategoryFlag;
		},

		needs: function (privilegeName, categoryId = 0) {

			if (this.has(...arguments)) {

				return 1
			}

			throw("The user does not have enough privileges for this action.");
		}
	}
}


function roles(userObj) {

	return {

		has: function (roleId, categoryId) {

			if (config.has('role_ignore') && config.get('role_ignore')) {
				return true;
			}

			if (userObj.error) {

				throw(userObj.message);
			}

			for (const role of userObj.roles) {

				if ((role.category_id === categoryId || constants.adminCategory.includes(role.category_id)) && (roleId === role.role || constants.adminRole.includes(role.role))) {

					return true;
				}
			}

			return false;

		},

		needs: function (roleId, categoryId) {

			if (this.has(...arguments)) {

				return 1
			}

			throw("The user does not have enough roles for this action.");
		}
	}
}

module.exports = User;