const API = require('../utils/api');

exports.list = class extends API {

	async list() {

		this.assert(
			((this.user.privilege.has('user.list', "ignore")) || (this.user.privilege.has('visualization.list', "ignore")) || (this.user.privilege.has('report.insert', "ignore")) || (this.user.privilege.has('report.update', "ignore"))),
			"User does not have privilege to view role list."
		);
		return await this.mysql.query('SELECT * FROM tb_roles WHERE account_id = ? ', [this.account.account_id]);
	}
}

exports.insert = class extends API {

	async insert({name, is_admin = 0} = {}) {

		this.user.privilege.needs('administrator');

		this.assert(name, 'Name required.');

		return await this.mysql.query(
			'INSERT INTO tb_roles SET ?',
			[{account_id: this.account.account_id, name, is_admin}],
			'write'
		);
	}
}

exports.update = class extends API {

	async update({name, is_admin = 0} = {}) {

		this.user.privilege.needs('administrator');

		this.assert(name, 'Name cannot be empty.');

		return await this.mysql.query(
			'UPDATE tb_roles SET ? WHERE role_id = ? AND account_id = ?',
			[{name, is_admin}, this.request.body.role_id, this.account.account_id],
			'write'
		);
	}
}

exports.delete = class extends API {

	async delete({role_id} = {}) {

		this.user.privilege.needs('administrator');

		this.assert(role_id, 'Invalid role_id.')

		return await this.mysql.query(
			'DELETE FROM tb_roles WHERE role_id = ? AND account_id = ?',
			[role_id, this.account.account_id],
			'write'
		);
	}
}

exports.test = class extends API {

	async test() {

		return[
			this.request.body,
			this.request.query,
			this.request.headers
		]
	}
}