const mysql = require('./utils/mysql').MySQL;
const bigquery = require('./utils/bigquery').setup;
const settings = require('./utils/settings');

async function loadAccounts() {

	const accountList = await mysql.query(`
		SELECT
			a.account_id,
			a.name,
			a.url,
			a.icon,
			a.logo,
			a.auth_api,
			f.feature_id,
			f.name AS feature_name,
			f.slug AS feature_slug,
			f.type AS feature_type,
			s.profile,
			s.value as settings
		FROM
			tb_accounts a
		LEFT JOIN
			tb_settings s
		ON
			a.account_id = s.owner_id
			AND s.status = 1
			AND s.owner = 'account'
			AND s.profile = 'main'
		LEFT JOIN
			tb_account_features af
		ON
			a.account_id = af.account_id
			AND af.status = 1
		LEFT JOIN
			tb_features f
		ON
			af.feature_id = f.feature_id
		WHERE
			a.status = 1
	`);

	const accounts = {};

	for (const account of accountList) {

		if (!accounts[account.account_id]) {

			accounts[account.account_id] = {
				account_id: account.account_id,
				name: account.name,
				url: account.url.split(',').filter(x => x.trim()),
				icon: account.icon,
				logo: account.logo,
				auth_api: account.auth_api
			};
		}

		if (!accounts[account.account_id].features) {

			accounts[account.account_id].features = new Map();

			accounts[account.account_id].features.needs = function (arg) {
				if (this.has(arg))
					return 1;

				const e = new Error("Insufficient feature privileges: " + arg);
				e.status = 400;
				throw e;
			}
		}

		accounts[account.account_id].features.set(account.feature_slug + '-' + account.feature_type, {

			feature_id: account.feature_id,
			name: account.feature_name,
			slug: account.feature_slug,
			type: account.feature_type
		});

		try {
			account.settings = JSON.parse(account.settings) || [];
		}
		catch(e) {
			account.settings = [];
		}

		if(!accounts[account.account_id].settings) {

			accounts[account.account_id].settings = new settings(account.settings);
		}

	}

	global.accounts = Object.values(accounts);
}

async function loadBigquery() {

	try {

		await bigquery();
	}
	catch(e) {

		console.log(e);
	}
}

function executingQueriesMap() {

	global.executingReports = new Map;
}

exports.loadAccounts = loadAccounts;
exports.loadBigquery = loadBigquery;
exports.executingQueriesMap = executingQueriesMap;
