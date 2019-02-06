const zlib = require('zlib');
const mysql = require('./mysql');
const crypto = require('crypto');
const fs = require('fs');
const pathSeparator = require('path').sep;
const {resolve} = require('path');
const commonFun = require('./commonFunctions');
const User = require('./User');
const constants = require('./constants');
const assert = require("assert");
const pgsql = require("./pgsql");
const errorLogs = require('./errorLogs');
const msssql = require("./mssql");
const oracle = require("./oracle");
const mongo = require("./mongo");
const child_process = require('child_process');
const atob = require('atob');
const dbConfig = require('config').get("sql_db");
const url = require('url');
const syncServer = require("./sync-server");

const environment = {
	name: process.env.NODE_ENV,
	deployed_on: new Date(),
	gitChecksum: child_process.execSync('git rev-parse --short HEAD').toString().trim(),
	branch: child_process.execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
};

class API {

	constructor(context = null) {

		this.mysql = mysql.MySQL;
		this.mssql = msssql.MsSql;
		this.environment = environment;

		if(context) {
			this.user = context.user;
			this.account = context.account;
			this.request = context.request;
			this.response = context.response;
		}
	}

	static setup() {

		API.endpoints = new Map;

		function walk(directory) {

			for (const file of fs.readdirSync(directory)) {

				const path = resolve(directory, file).replace(/\//g, pathSeparator);

				if (fs.statSync(path).isDirectory()) {
					walk(path);
					continue;
				}

				if (!path.endsWith('.js'))
					continue;

				const module = require(path);

				for (const key in module) {

					// Make sure the endpoint extends API class
					if (module.hasOwnProperty(key) && module[key] && module[key].prototype && module[key].prototype instanceof API)
						API.endpoints.set([path.slice(0, -3), key].join(pathSeparator), module[key]);
				}
			}
		}

		walk(__dirname + '/../www');
	}

	static serve(clientEndpoint) {

		return async function (request, response, next) {

			const catageories = [
				{
					name: 'connection.mssql',
					object: msssql,
				},
				{
					name: 'connection.mysql',
					object: mysql,
				},
				{
					name: 'connection.pgsql',
					object: pgsql,
				},
				{
					name: 'connection.oracle',
					object: oracle,
				},
				{
					name: 'connection.mongo',
					object: mongo,
				},
				{
					name: 'account',
					object: {},
				}
			];

			for(const type of catageories) {

				const status = await syncServer.status(type.name);

				if(status) {

					console.log('###### Outdated ', type.name);

					syncServer.call(type);
				}
			}

			let obj;

			try {

				const
					url = request.url.replace(/\//g, pathSeparator),
					path = resolve(__dirname + '/../www') + pathSeparator + url.substring(4, url.indexOf('?') < 0 ? undefined : url.indexOf('?'));

				if (!API.endpoints.has(path) && !clientEndpoint) {
					return next();
				}

				let endpoint = clientEndpoint || API.endpoints.get(path);

				obj = new endpoint();

				obj.request = request;
				obj.response = response;

				let
					token = request.query.token || request.body.token,
					userDetails;

				if(request.cookies.token) {
					token = request.cookies.token;
				}

				if (token) {

					userDetails = await commonFun.verifyJWT(token);

					if(!userDetails.error) {
						obj.user = new User(userDetails);
					}
				}

				const checksums = [environment.gitChecksum];
				let host = request.headers.host.split(':')[0];

				for(const account of global.accounts || []) {

					if(userDetails && account.account_id == userDetails.account_id)
						obj.account = account;
				}

				if(!obj.account) {
					for(const account of global.accounts || []) {

						if(account.url.includes(host)) {

							obj.account = account;
							break;
						}
					}
				}

				if (obj.account) {

					checksums.push(
						crypto.createHash('md5').update(JSON.stringify(obj.account)).digest('hex'),
						crypto.createHash('md5').update(JSON.stringify([...obj.account.settings.entries()])).digest('hex')
					);
				}

				if(obj.user) {

					checksums.push(
						crypto.createHash('md5').update(JSON.stringify(obj.user.json.settings || '')).digest('hex')
					);
				}

				obj.checksum = crypto.createHash('md5').update(checksums.join()).digest('hex').substring(0, 10);
				obj.environment = environment;

				if (clientEndpoint) {
					obj.originalResult = await obj.body();
					return response.send(obj.originalResult);
				}

				if ((!userDetails || userDetails.error) &&
					!constants.publicEndpoints.filter(u => url.startsWith(u.replace(/\//g, pathSeparator))).length &&
					!constants.nonAccountEndpoints.filter(u => url.startsWith(u.replace(/\//g, pathSeparator))).length
				) {

					throw new API.Exception(401, 'User Not Authenticated!');
				}

				const
					params = {...request.query, ...request.body},
					entryName = path.split(pathSeparator).pop();

				if(!obj[entryName] || typeof obj[entryName] != 'function')
					throw new API.Exception(400, `The API class has no function named "${entryName}"`);

				const result = await obj[entryName](params);

				obj.result = {
					status: result ? true : false,
					data: result,
				};

				await obj.gzip();

				response.set({'Content-Encoding': 'gzip'});
				response.set({'Content-Type': 'application/json'});

				response.send(obj.result);
			}

			catch (e) {

				if(e.pass) {
					return;
				}

				if (obj) {

					await API.errorMessage(e, obj);
				}

				if (e instanceof API.Exception) {

					return response.status(e.status || 500).send({
						status: false,
						message: e.message,
					});
				}

				if (e instanceof assert.AssertionError) {

					if (commonFun.isJson(e.message)) {
						e.message = JSON.parse(e.message);
					}
					e.status = e.message.status || 400;
					e.message = e.message.message || (typeof e.message === typeof "string" ? e.message : "Something went wrong!");
				}

				if (!(e instanceof Error)) {

					e = new Error(e);
					e.status = 401;
				}

				else {
					e.status = e.status || 500;
				}

				return next(e);
			}

			finally {

				if(!obj.account || obj.account.account_id != 3)
					return;

				const db = dbConfig.write.database.concat('_logs');

				let
					user_id = null,
					token = obj.request.body.token ||
							obj.request.body.refresh_token ||
							obj.request.query.token ||
							obj.request.query.refresh_token ||
							obj.request.cookies.token;

				try {
					const decodedToken = JSON.parse(atob(token.body.split('.')[1]));

					user_id = JSON.parse(decodeURIComponent(decodedToken.data)).user_id;
				} catch(e) {}

				// Ignore TV panel user
				if(user_id == 16563)
					return;

				mysql.MySQL.query(`
					INSERT INTO ??.tb_api_logs (
						account_id, user_id, pathname, body, query, headers, response, status, useragent
					) VALUES (?)`,
					[
						db,
						[
							obj.account.account_id,
							user_id,
							url.parse(obj.request.url).pathname,
							JSON.stringify(obj.request.body),
							JSON.stringify(obj.request.query),
							JSON.stringify(obj.request.headers),
							JSON.stringify(obj.originalResult) || obj.originalResult,
							obj.response.statusCode,
							obj.request.headers['user-agent'],
						]
					],
					'write'
				);

			}
		}
	}

	static async errorMessage(e, obj) {

		try {

			let
				status,
				details = {};

			try {

				details = await commonFun.getUserDetailsJWT(obj.request.body.refresh_token || obj.request.query.refresh_token);
			}
			catch(e){}

			try {
				status = JSON.parse(e.message).status;
			}
			catch(e){}

			const error = {
				account_id: obj.account.account_id,
				user_id: obj.user.user_id,
				message: e.message || e.sqlMessage,
				url: obj.request.url,
				description: JSON.stringify(e),
				type: "server",
				user_agent: obj.request.get('user-agent'),
				status: status || e.status,
				session_id: details.session_id,
			};

			await errorLogs.insert(error);
		}
		catch (e) {
			return e;
		}

	}

	async gzip() {

		return new Promise((resolve, reject) => {
			zlib.gzip(JSON.stringify(this.result), (error, result) => {

				if (error)
					reject(['API response gzip compression failed!', error]);

				else {
					this.originalResult = this.result;
					this.result = result;
					resolve();
				}
			});
		});
	}

	assert(expression, message, statusCode) {

		return assert(expression,
			JSON.stringify({
				message: message,
				status: statusCode,
			}));
	}
}

API.Exception = class {

	constructor(status, message) {
		this.status = status;
		this.message = message;

		console.error("API Exception Error!!!!", this);
		console.trace();
	}
}

module.exports = API;

API.setup();