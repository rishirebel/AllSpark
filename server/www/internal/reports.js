const API = require('../../utils/api');
const dbConfig = require('config').get('sql_db');
const constants = require("../../utils/constants");
const internalReports = require('./queries').internalReports;

class InternalAnalytics extends API {

	async run({query_id, param_sdate, param_edate} = {}) {

		query_id = parseInt(query_id);

		this.assert(internalReports.has(query_id), 'Invalid id');

		const
			report = new (internalReports.get(query_id))(),
			logsDb = dbConfig.write.database.concat('_logs');

		report.query = report.query
			.replace(/{{account_id}}/g, this.account.account_id)
			.replace(/{{logs_db}}/g, logsDb)
			.replace(/{{sdate}}/g, `"${param_sdate}"`)
			.replace(/{{edate}}/g, `"${param_edate}"`);

		return {
			data: await this.mysql.query(report.query, null)
		};
	}

	async list() {

		return [...internalReports.values()].map(x => (new x()).json);
	}
}

exports.list = InternalAnalytics;
exports.run   = InternalAnalytics;