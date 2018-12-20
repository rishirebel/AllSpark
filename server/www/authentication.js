const API = require("../utils/api");
const commonFun = require('../utils/commonFunctions');
const crypto = require('crypto');
const request = require('request');
const promisify = require('util').promisify;
const Mailer = require('../utils/mailer');
const cycleDetection = require("./privileges_manager").cycleDetection;
const config = require("config");
const constants = require("../utils/constants");
const account = require('../onServerStart');
const fetch = require('node-fetch');
const URLSearchParams = require('url').URLSearchParams;
const redis = require("../utils/redis").Redis;
const sessionLogs = require("./session-logs").sessions;

const EXPIRE_AFTER = 1; //HOURS

exports.resetlink = class extends API {

	async resetlink() {

		if(this.account.auth_api) {

			throw new Error('Invalid Request.');
		}

		let user = await this.mysql.query(
			`SELECT user_id, first_name, last_name FROM tb_users WHERE email = ? AND account_id = ?`,
			[this.request.body.email, this.request.body.account_id]
		);

		this.assert(user.length, "user not found");

		const token = await new Promise((resolve, reject) => {
			crypto.randomBytes(80, function (err, buf) {
				if (err) {
					reject(err);
				}
				else {
					resolve(buf.toString('hex'));
				}
			});
		});

		user = user[0];
		const user_id = user['user_id'];

		await this.mysql.query('update tb_password_reset set status = 0 where status = 1 and user_id = ?', [user_id], 'write');
		const query = `INSERT INTO tb_password_reset(user_id, reset_token, status) values ?`;
		await this.mysql.query(query, [[[user_id, token, 1]]], 'write');

		const [account] = await this.mysql.query(`
				SELECT
					*
				FROM
					tb_accounts
				where
					account_id = ?
			`, [this.request.body.account_id]
		);

		this.assert(account.account_id, "Account not found");

		let emailUrl = this.account.url.includes(this.request.headers.host) ? this.request.headers.host : this.account.url[0];

		let mailer = new Mailer();
		mailer.from_email = 'no-reply@' + config.get("mailer").get("domain");
		mailer.from_name = account.name;
		mailer.to.add(this.request.body.email);
		mailer.subject = `Password reset for ${account.name}`;
		mailer.html = `
			<div style="height:300px;width: 750px;margin:0 auto;border: 1px solid #ccc;padding: 20px 40px; box-shadow: 0 0 25px rgba(0, 0, 0, 0.1);">

				<div style="height:40px; background-image:url('${this.account.logo}'); display: flex; border-bottom:1px solid #999; background-repeat:no-repeat; margin-bottom: 25px; background-size:250px; background-position:left; font-size: 125%; padding: 10px 0;">
					<div style="margin-left: auto; padding: 20px 0; font-size: 14px; color:#666;">KATO</div>
				</div>

				<div>
					<div style="font-size:14px;color:#666">
						Dear ${user['first_name']},
						<br/><br/>
					</div>

					<div style="font-size:14px;">
						<span style="color: #666;">
							We understand you'd like to change your password. Just click on the link below to reset your password.
						</span>
					</div>
					<a href="https://${emailUrl}/login/reset?reset_token=${token}&email=${this.request.body.email}&account=${account.name}" style="display: flex;font-size:14px; text-decoration: none; margin: 10px 0;" target="_blank">
						Please click here.
					</a>
					<div style="display:flex; margin: 10px 0;color:#666; font-size:14px;">Please do not forget that your password is case sensitive.</div>
					<div style="font-size:14px;display:flex; margin: 10px 0;color:#666;">If you did not ask for a password change, kindly ignore this email.</div>
					<div style="font-size:14px;color:#666; padding: 15px 0;">
						<div>Thank You,</div>
						<div><a href="https://jungleworks.com/kato" style="text-decoration: none;" target="_blank">Kato</a> team.</div>
					</div>
				</div>

			</div>
		`;

		const [response] = await mailer.send();

		if (response.status === "rejected") {

			return response.reject_reason
		}

		return 'Password reset email sent!';
	}
}


exports.reset = class extends API {

	async reset() {

		if (!this.request.body.password || !this.request.body.reset_token || this.account.auth_api)
			return false;

		const query = `
			select
				user_id
			from
				tb_password_reset
			where
				reset_token = ?
				and status = 1
				and (created_at > now() - interval ? hour)
		`;

		let user_id = await this.mysql.query(query, [this.request.body.reset_token, EXPIRE_AFTER]);

		if (!user_id.length)
			throw new API.Exception(400, 'Invalid Token, Please reset the password again.');

		user_id = user_id[0]['user_id'];

		const account_id = await this.mysql.query(
			`
				SELECT
					account_id
				FROM
					tb_users
				WHERE
					user_id = ?
			`, [user_id]
		);

		const newHashPass = await commonFun.makeBcryptHash(this.request.body.password);

		await this.mysql.query('UPDATE tb_users SET password = ? WHERE user_id = ? AND account_id = ?', [newHashPass, user_id, account_id[0].account_id], 'write');

		await this.mysql.query('UPDATE tb_password_reset SET status = 0 WHERE status = 1 AND user_id = ?', [user_id], 'write');

		return 'Password Reset Successfully! You can log in now.';
	}
};


exports.login = class extends API {

	load() {

		this.requestAccount = this.request.body.account_id;
		this.email = this.request.body.email;

		this.possibleAccounts = [];

		if (this.requestAccount) {

			this.possibleAccounts = global.accounts.filter(x => x.account_id === this.requestAccount);
		}

		else {

			this.possibleAccounts = global.accounts.filter(x => x.url.includes(this.request.hostname));
		}

		this.authResponseObj = {};
	}

	async requestAuthAPI() {

		let parameters = new URLSearchParams;

		const externalParameters = this.possibleAccounts[0].settings.get("external_parameters");

		if (Array.isArray(externalParameters)) {

			for (const parameter of externalParameters) {

				const
					externalValue = this.request.body[constants.external_parameter_prefix + parameter.name],
					value = externalValue || !isNaN(parseFloat(externalValue)) ? externalValue : parameter.value;

				if (Array.isArray(value)) {

					for (const item of value) {

						parameters.append(parameter.name, item);
					}
				}

				else {

					parameters.append(parameter.name, value);
				}
			}
		}

		parameters.append('account_id', this.possibleAccounts.length > 1 ? 0 : (this.request.body.account_id || 0));

		let url = this.possibleAccounts[0].auth_api + "?" + parameters;

		try {

			let authAPIResponse = await fetch(url, {"method": "GET"});
			let status = authAPIResponse.status;

			authAPIResponse = await authAPIResponse.json();

			if (!(authAPIResponse.data && authAPIResponse.data.userDetails)) {

				throw({message: authAPIResponse.message, status: status});
			}

			authAPIResponse = authAPIResponse.data;
			this.userDetails = authAPIResponse.userDetails;

			await account.loadAccounts();
			this.authResponseObj = JSON.parse(JSON.stringify(authAPIResponse));
			delete this.authResponseObj.userDetails;

		}
		catch (e) {

			console.error(e);

			this.assert(false, e.message, 401);
		}
	}

	async login() {


		if(redis) {

			const redisHash = `userLoginTimeout#${crypto.createHash('md5').update(JSON.stringify(this.request.body) || "").digest('hex')}`;
			const redisResult = await redis.get(redisHash);

			if(redisResult) {
				throw new API.Exception(400, "You're doing that too often. Please wait 3 seconds.");
			}

			await redis.set(redisHash, 1);

			await redis.expire(redisHash, 3);
		}

		this.load();

		if (!this.email) {

			this.assert(this.possibleAccounts.length, "No account found");


			if (!this.possibleAccounts[0].auth_api) {

				throw new API.Exception(400, "Could't authenticate, please specify this account's Authorization API or login using Email.")
			}

			await this.requestAuthAPI();
		}

		else {

			const userDetails = await this.mysql.query(`
				select
					u.*
				from
					tb_users u
				join
					tb_accounts a
					using(account_id)
				where
					email = ?
					and u.status = 1
					and a.status = 1
					and account_id in (?)
				`,
				[this.email, this.requestAccount ? [this.requestAccount] : this.possibleAccounts.map(x => x.account_id)]
			);

			if (userDetails.length > 1) {

				const accountsObj = {};

				for (const account of global.accounts) {

					accountsObj[account.account_id] = account;
				}

				return userDetails.map(x => accountsObj[x.account_id]);
			}

			else {

				this.userDetails = userDetails[0];
				this.assert(this.userDetails && this.userDetails.user_id, "Email not found");

				this.possibleAccounts = global.accounts.filter(x => x.account_id === this.userDetails.account_id);

				if (this.possibleAccounts[0].auth_api && this.request.body.external_parameters) {

					await this.requestAuthAPI();
				}

				if (!this.request.body.password) {

					return this.possibleAccounts;
				}

				if (!this.request.body.external_parameters && this.request.body.password) {

					const checkPassword = await commonFun.verifyBcryptHash(this.request.body.password, this.userDetails.password);
					this.assert(checkPassword, "Invalid Password!");
				}
			}
		}

		this.assert(this.userDetails && this.userDetails.user_id, "user not found while loading user's details");

		const user_agent = new commonFun.UserAgent(this.request.get('user-agent'));

		let session = {};

		const expiryTime = Math.floor(Date.now() / 1000) + (parseInt(this.userDetails.ttl || 30) * 86400);

		try {
			sessionLogs.request = {};

			Object.assign(sessionLogs.request, this.request);

			sessionLogs.request.body = {
				user_id: this.userDetails.user_id,
				type: 'login',
				description: 'Login',
				user_agent: this.request.get('user-agent'),
				os: user_agent.os,
				browser: user_agent.browser,
				ip: this.request.connection.remoteAddress,
			}

			session = await sessionLogs.insert();
		}
		catch (e) {
		}

		const obj = {
			user_id: this.userDetails.user_id,
			email: this.userDetails.email,
			account_id: this.userDetails.account_id,
			session_id: session.insertId,
		};

		const finalObj = {
			jwt: commonFun.makeJWT(obj, expiryTime),
		};

		Object.assign(finalObj, this.authResponseObj);

		this.response.cookie('refresh_token', finalObj.jwt, { maxAge: 365 * 24 * 60 * 60 * 1000, path: '/' });

		return finalObj;
	}
};

exports.refresh = class extends cycleDetection {

	async refresh() {

		let userDetail = await commonFun.verifyJWT(this.request.body.refresh_token);

		const sessionId = userDetail.session_id;

		this.assert(!userDetail.error, "Token not correct", 401);

		if (this.account.auth_api && this.request.body.external_parameters) {

			this.possibleAccounts = [this.account];

			const loginObj = new exports.login();

			Object.assign(loginObj, this);

			loginObj.request.body.account_id = userDetail.account_id;

			await loginObj.requestAuthAPI();

			userDetail = loginObj.userDetails;
		}

		this.assert(userDetail, "User not found!", 401);

		const [user] = await this.mysql.query("SELECT * FROM tb_users WHERE user_id = ? and status = 1", userDetail.user_id);

		this.assert(user, "User not found!", 401);

		const [userPrivilegesRoles, accountPrivileges] = await Promise.all([this.mysql.query(`
				SELECT
					'privileges' AS 'owner',
					user_id,
					IF(p.is_admin = 1, 0, privilege_id) owner_id,
					p.name AS owner_name,
					IF(c.is_admin = 1, 0, category_id) AS category_id,
					c.name AS category_name
				FROM
					tb_user_privilege up
				JOIN tb_privileges p
					USING(privilege_id)
				JOIN tb_users u
					USING(user_id)
				JOIN tb_categories c
					USING(category_id)
				WHERE
					user_id = ?
					AND u.account_id = ?
					and u.status = 1

				UNION ALL

                SELECT
					'roles' AS 'owner',
					user_id,
					IF(r.is_admin = 1, 0, role_id) AS owner_id,
					r.name AS role_name,
					IF(c.is_admin = 1, 0, category_id) AS category_id,
					c.name AS category_name
				FROM
					tb_object_roles obr
				JOIN
					tb_roles r
					ON r.role_id = obr.target_id
				JOIN
					tb_categories c
					USING(category_id)
				JOIN
					tb_users u
					ON u.user_id = obr.owner_id
					AND u.account_id = obr.account_id
				WHERE
					OWNER = "user"
					AND target = "role"
					AND u.status = 1
					AND u.user_id = ?
					AND u.account_id = ?
               `,
			[user.user_id, user.account_id, user.user_id, user.account_id]
		),
			this.mysql.query(
				"select pt.*, p.name from tb_privileges p join tb_privileges_tree pt using(privilege_id) where (account_id = ? or account_id = 0) and p.status = 1",
				[this.account.account_id]
			),
		]);

		this.accountPrivileges = accountPrivileges;

		this.cycleDetection();

		let privileges = [];

		for (let privilege of userPrivilegesRoles.filter(privilegeRoles => privilegeRoles.owner === "privileges")) {

			if (privilege.owner_id == 0 || JSON.stringify([...this.simplifiedTreeMapping.get(privilege.owner_id)]) == JSON.stringify([0])) {

				privilege.owner_id = [privilege.owner_id];
			}

			else {

				privilege.owner_id = [...this.simplifiedTreeMapping.get(privilege.owner_id)];
			}
			for (const privilegeId of privilege.owner_id) {

				privileges.push({
					privilege_id: privilegeId,
					privilege_name: privilege.owner_name,
					category_id: privilege.category_id,
				});
			}
		};

		let privilegeObj = {};

		this.accountPrivileges.map(x => privilegeObj[x.privilege_id] = x);

		for (const privilege of privileges) {

			if (!privilegeObj[privilege.privilege_id] || privilegeObj[privilege.privilege_id].is_admin) {

				privilege.privilege_id = 0;
				privilege.privilege_name = constants.privilege.administrator;
				continue;
			}

			privilege.privilege_name = privilegeObj[privilege.privilege_id].name;

		}

		const roles = userPrivilegesRoles.filter(privilegeRoles => privilegeRoles.owner === "roles").map(x => {

			return {
				category_id: x.category_id,
				role: x.owner_id,
			}
		});

		const obj = {
			user_id: user.user_id,
			account_id: user.account_id,
			email: user.email,
			name: [user.first_name, user.middle_name, user.last_name].filter(x => x).join(' '),
			roles,
			privileges,
			session_id: sessionId,
		};

		if (config.has("superAdmin_users") && config.get("superAdmin_users").includes(user.email)) {

			obj.privileges.push({
				privilege_id: -1,
				privilege_name: constants.privilege.superadmin,
				category_id: constants.adminCategory[0],
			})
		}

		const token = commonFun.makeJWT(obj, Math.floor(Date.now() / 1000) + (10 * 60));

		this.response.cookie('token', token, { maxAge: 365 * 24 * 60 * 60 * 1000, path: '/' });

		return token;
	}
}