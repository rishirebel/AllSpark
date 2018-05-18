const API = require("../../utils/api");
const commonFun = require('../../utils/commonFunctions');
const dbConfig = require('config').get("sql_db");
const promisify = require('util').promisify;
//const BigQuery = require('../../www/bigQuery').BigQuery;
const constants = require("../../utils/constants");
const crypto = require('crypto');
const request = require("request");
const auth = require('../../utils/auth');
const redis = require("../../utils/redis").Redis;
const requestPromise = promisify(request);
const config = require("config");
const fs = require("fs");
const fetch = require('node-fetch');
const URLSearchParams = require('url').URLSearchParams;

// prepare the raw data
class report extends API {

	async load(reportObj, filterList) {

		if (reportObj && filterList) {

			this.reportObj = reportObj;
			this.filterList = filterList;
			this.reportId = reportObj.query_id;
		}

		let reportDetails = [

			this.mysql.query(`
				SELECT
				  q.*,
				  IF(user_id IS NULL, 0, 1) AS flag,
				  c.type
				FROM
					tb_query q
				LEFT JOIN
					 tb_user_query uq ON
					 uq.query_id = q.query_id
					 AND user_id = ?
				JOIN
					tb_credentials c
					ON q.connection_name = c.id
				WHERE
					q.query_id = ?
					AND is_enabled = 1
					AND is_deleted = 0
					AND q.account_id = ?
					AND c.account_id = ?
					AND c.status = 1`,

				[this.user.user_id, this.reportId, this.account.account_id, this.account.account_id],
			),

			this.mysql.query(`select * from tb_query_filters where query_id = ?`, [this.reportId])
		];

		reportDetails = await Promise.all(reportDetails);
		this.assert(reportDetails[0].length, "Report Id: " + this.reportId + " not found");

		this.reportObj = reportDetails[0][0];
		this.filters = reportDetails[1] || [];

		let [preReportApi] = await this.mysql.query(
			`select value from tb_settings where owner = 'account' and profile = 'pre_report_api' and account_id = ?`,
			[this.account.account_id],
		);

		if (preReportApi && commonFun.isJson(preReportApi.value)) {

			preReportApi = (JSON.parse(preReportApi.value)).value;

			let preReportApiDetails;

			try {
				preReportApiDetails = await requestPromise({

					har: {
						url: preReportApi + this.request.body[constants.filterPrefix + "access_token"],
						method: 'GET',
						headers: [
							{
								name: 'content-type',
								value: 'application/x-www-form-urlencoded'
							}
						]
					},
					gzip: true
				});
			}
			catch (e) {
				return {"status": false, data: "invalid request " + e.message};
			}

			preReportApiDetails = JSON.parse(preReportApiDetails.body).data[0];

			for (const key in preReportApiDetails) {

				this.filters.push({
					placeholder: key,
					value: JSON.stringify(preReportApiDetails[key]),
					default_value: JSON.stringify(preReportApiDetails[key]),
				})
			}
		}

		this.reportObj.query = this.request.body.query || this.reportObj.query;
	}

	async authenticate() {

		const authResponse = await auth.report(this.reportObj, this.user);
		this.assert(!authResponse.error, "user not authorised to get the report");
	}

	prepareFiltersForOffset() {

		//filter fields required = offset, placeholder, default_value

		const types = [
			'string',
			'number',
			'date',
			'month',
		];

		for (const filter of this.filters) {

			if (isNaN(parseFloat(filter.offset))) {

				continue;
			}

			if (types[filter.type] == 'date') {

				filter.default_value = new Date(Date.now() + filter.offset * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
				filter.value = this.request.body[constants.filterPrefix + filter.placeholder] || filter.default_value;

				if (filter.value === new Date().toISOString().slice(0, 10)) {
					this.has_today = true;

				}
			}

			if (types[filter.type] == 'month') {

				const date = new
				Date();

				filter.default_value = new Date(Date.UTC(date.getFullYear(), date.getMonth() + filter.offset, 1)).toISOString().substring(0, 7);
				filter.value = this.request.body[constants.filterPrefix + filter.placeholder] || filter.default_value;

				if (filter.value === new Date().toISOString().slice(0, 7)) {

					this.has_today = true;
				}
			}
		}

		for (const filter of this.filters) {

			filter.value = this.request.body[constants.filterPrefix + filter.placeholder] || filter.default_value;
		}
	}

	async report(queryId, reportObj, filterList) {

		this.reportId = this.request.body.query_id || queryId;
		this.reportObjStartTime = Date.now();
		const forcedRun = parseInt(this.request.body.cached) === 0;


		await this.load(reportObj, filterList);

		await this.authenticate();

		this.prepareFiltersForOffset();

		let preparedRequest;

		switch (this.reportObj.type.toLowerCase()) {
			case "mysql":
				preparedRequest = new MySQL(this.reportObj, this.filters, this.request.body.token);
				break;
			case "api":
				preparedRequest = new APIRequest(this.reportObj, this.filters, this.request.body.token);
				break;
			case "pgsql":
				preparedRequest = new Postgres(this.reportObj, this.filters, this.request.body.token);
				break;
			default:
				this.assert(false, "Report Type " + this.reportObj.type.toLowerCase() + " does not exist", 404);
		}

		preparedRequest = preparedRequest.finalQuery;

		const engine = new ReportEngine(preparedRequest);

		const hash = "Report#report_id:" + this.reportObj.query_id + "#hash:" + engine.hash + '#redis-timeout#' + this.reportObj.is_redis;

		if (this.reportObj.is_redis === "EOD") {

			const d = new Date();
			this.reportObj.is_redis = (24 * 60 * 60) - (d.getHours() * 60 * 60) - (d.getMinutes() * 60) - d.getSeconds();
		}

		let redisData = null;

		if (redis) {
			redisData = await redis.get(hash);
		}

		let result;

		if (!forcedRun && this.reportObj.is_redis && redisData && !this.has_today) {

			try {

				result = JSON.parse(redisData);

				await engine.log(this.reportObj.query_id, this.reportObj.query, result.query,
					Date.now() - this.reportObjStartTime, this.reportObj.type,
					this.user.user_id, 1, JSON.stringify({filters: this.filters})
				);

				result.cached = {
					status: true,
					age: Date.now() - result.cached.store_time
				};
				return result;
			}
			catch (e) {
				throw new API.Exception(500, "Invalid Redis Data! :(");
			}
		}

		try {

			result = await engine.execute();
		}
		catch (e) {

			console.error(e.stack);
			throw new API.Exception(400, e.message);
		}

		await engine.log(this.reportObj.query_id, this.reportObj.query, result.query, result.runtime,
			this.reportObj.type, this.user.user_id, 0, JSON.stringify({filters: this.filters})
		);

		const EOD = new Date();
		EOD.setHours(23, 59, 59, 999);

		result.cached = {store_time: Date.now()};

		if (redis) {

			await redis.set(hash, JSON.stringify(result));

			if (this.reportObj.is_redis) {
				await redis.expire(hash, this.reportObj.is_redis);
			}
		}


		result.cached = {status: false};

		return result;
	}
}


class MySQL {

	constructor(reportObj, filters = [], token = null) {

		this.reportObj = reportObj;
		this.filters = filters;
		this.token = token;
	}

	get finalQuery() {

		this.prepareQuery();

		return {
			request: [this.reportObj.query, this.filterList || [], this.reportObj.connection_name,],
			type: "mysql"
		};
	}

	prepareQuery() {

		this.reportObj.query = this.reportObj.query
			.replace(/--.*(\n|$)/g, "")
			.replace(/\s+/g, ' ');

		this.filterIndices = {};

		for (const filter of this.filters) {

			this.filterIndices[filter.placeholder] = {

				indices: (commonFun.getIndicesOf(`{{${filter.placeholder}}}`, this.reportObj.query)),
				value: filter.value,
			};
		}

		for (const filter of this.filters) {

			if(filter.type === 5) {

				this.reportObj.query = this.reportObj.query.replace(new RegExp(`{{${filter.placeholder}}}`, 'g'), "??");
				continue;
			}

			this.reportObj.query = this.reportObj.query.replace(new RegExp(`{{${filter.placeholder}}}`, 'g'), "?");

		}

		this.filterList = this.makeQueryParameters();

	}

	makeQueryParameters() {

		const filterIndexList = [];

		for (const placeholder in this.filterIndices) {

			this.filterIndices[placeholder].indices = this.filterIndices[placeholder].indices.map(x =>

				filterIndexList.push({
					value: this.filterIndices[placeholder].value,
					index: x,
				})
			);
		}

		return (filterIndexList.sort((x, y) => x.index - y.index)).map(x => x.value) || [];
	}
}

class APIRequest {

	constructor(reportObj, filters = [], token) {

		this.reportObj = reportObj;
		this.filters = filters;
		this.token = token;
	}

	get finalQuery() {

		this.prepareQuery();

		if (this.urlOptions.method === "GET") {

			return {
				request: [this.url, {...this.urlOptions}],
				type: "api",
			}
		}

		return {
			request: [this.url, {body: this.parameters, ...this.urlOptions}],
			type: "api",
		}
	}

	prepareQuery() {

		let parameters = new URLSearchParams;

		for (const filter of this.filters) {

			if (filter.value.__proto__.constructor.name === "Array") {

				for (const item of filter.value) {

					parameters.append(filter.placeholder, item);
				}
			}

			else {

				parameters.append(filter.placeholder, filter.value);
			}
		}


		try {

			this.urlOptions = JSON.parse(this.reportObj.url_options);
		}

		catch (e) {

			const err = Error("url options is not JSON");
			err.status = 400;
			return err;
		}

		if (!this.filters.filter(f => f.placeholder === 'token').length) {

			parameters.append("token", this.token);
		}

		this.url = this.reportObj.url;

		if (this.urlOptions.method === 'GET') {

			this.url += "?" + parameters;
		}

		this.parameters = parameters;

	}
}

class Postgres {

	constructor(reportObj, filters = [], token) {

		this.reportObj = reportObj;
		this.filters = filters;
		this.token = token;

	}

	get finalQuery() {

		this.applyFilters();

		return {
			request: [this.reportObj.query, this.values, this.reportObj.connection_name,],
			type: "pgsql",
		};
	}

	applyFilters() {

		this.reportObj.query = this.reportObj.query
			.replace(/--.*(\n|$)/g, "")
			.replace(/\s+/g, ' ');

		this.values = [];
		this.index = 1;

		for (const filter of this.filters) {

			if (filter.value.__proto__.constructor.name === "Array") {

				this.reportObj.query = this.replaceArray(new RegExp(`{{${filter.placeholder}}}`, 'g'), this.reportObj.query, filter.value);
			}

			else {

				this.reportObj.query = this.replaceArray(new RegExp(`{{${filter.placeholder}}}`, 'g'), this.reportObj.query, [filter.value]);
			}
		}
	}

	replaceArray(exp, str, arr) {

		const containerArray = [];

		for (let occurrence = 0; occurrence < (str.match(exp) || []).length; occurrence++) {

			const tempArr = [];

			for (let arrIndex = 0; arrIndex < arr.length; arrIndex++) {

				tempArr.push("$" + this.index++);
			}

			containerArray.push(tempArr);
			this.values = this.values.concat(arr);
		}

		str = str.replace(exp, (() => {
			let number = 0;

			return () => (containerArray[number++] || []).join(", ");

		})());

		return str;
	}
}

class ReportEngine extends API {

	constructor(parameters) {

		super();

		ReportEngine.engines = {
			mysql: this.mysql.query,
			pgsql: this.pgsql.query,
			api: fetch,
		};

		this.parameters = parameters || {};
	}

	get hash() {

		if (this.parameters.type === 'api' && this.parameters.request[1].body) {

			this.parameters.request[1].params = this.parameters.request[1].body.toString();
		}
		return crypto.createHash('md5').update(JSON.stringify(this.parameters)).digest('hex');
	}

	async execute() {

		this.executionTimeStart = Date.now();

		if (!Object.keys(this.parameters).length) {

			this.parameters = {
				request: [this.request.body.query, [], this.request.body.connection_id],
				type: this.request.body.type
			}
		}

		let data = await ReportEngine.engines[this.parameters.type](...this.parameters.request);

		let query;

		if (["mysql", "pgsql"].includes(this.parameters.type)) {

			query = data.instance ? data.instance.sql : data;
		}

		else if (this.parameters.type === "api") {

			query = this.parameters.request;

			data = await data.json();
		}

		return {
			data: data,
			runtime: (Date.now() - this.executionTimeStart),
			query: query,
		};
	}

	async log(query_id, query = "", result_query, executionTime, type, userId, is_redis, rows) {

		try {

			if (typeof result_query === "object") {

				query = JSON.stringify(query);
				result_query = JSON.stringify(result_query);
			}

			const db = dbConfig.write.database.concat('_logs');

			await this.mysql.query(`
				INSERT INTO
					${db}.tb_report_logs (
						query_id,
						query,
						result_query,
						response_time,
						type,
						user_id,
						cache,
						\`rows\`
					)
				VALUES
					(?,?,?,?,?,?,?,?)`,
				[query_id, query, result_query, executionTime, type, userId, is_redis, rows],
				"write"
			);
		}

		catch (e) {

			console.log(e);
		}
	}
}

class query extends API {

	async query() {

		const [type] = await this.mysql.query("select type from tb_credentials where id = ?", [this.request.body.connection_id]);

		this.assert(type, "credential id " + this.request.body.connection_id + " not found");

		this.parameters = {
			request: [this.request.body.query, [], this.request.body.connection_id],
			type: this.request.body.type || type.type
		};

		const reportEngine = new ReportEngine(this.parameters);

		return await reportEngine.execute();
	}
}


class download extends API {

	static async jsonRequest(obj, url) {

		return new Promise((resolve, reject) => {

				request({
						method: 'POST',
						uri: url,
						json: obj
					},
					function (error, response, body) {
						if (error) {
							return reject(error)
						}
						return resolve({
							response,
							body
						})
					})
			}
		)
	}

	async download() {

		let queryData = this.request.body.data;

		this.assert(this.request.body.visualization);

		let [excel_visualization] = await this.mysql.query("select * from tb_visualizations where slug = ?", [this.request.body.visualization]);

		this.assert(excel_visualization, "visualization does not exist");

		excel_visualization = excel_visualization.excel_format;

		this.assert(commonFun.isJson(excel_visualization), "excel_visualization format issue");

		// queryData = JSON.parse(queryData);
		const fileName = `${this.request.body.file_name}_${(new Date().toISOString()).substring(0, 10)}_${(this.user || {}).user_id || ''}`;
		const requestObj = {
			data_obj: [
				{
					series: queryData,
					charts: {
						1: {
							x: {name: this.request.body.bottom},
							y: {name: this.request.body.left},
							x1: {name: this.request.body.top},
							y1: {name: this.request.body.right},
							cols: this.request.body.columns,
							type: JSON.parse(excel_visualization),
						}
					},
					sheet_name: this.request.body.sheet_name.slice(0, 20),
					file_name: fileName.slice(0, 20)
				},
			]
		};

		const data = await download.jsonRequest(requestObj, config.get("allspark_python_base_api") + "xlsx/get");

		this.response.sendFile(data.body.response);
		throw({"pass": true})

	}
}

exports.query = query;
exports.report = report;
exports.ReportEngine = ReportEngine;
exports.Postgres = Postgres;
exports.APIRequest = APIRequest;
exports.download = download;