const API = require("../../utils/api");
const commonFun = require('../../utils/commonFunctions');
const dbConfig = require('config').get("sql_db");
const promisify = require('util').promisify;
const bigQuery = require('../../utils/bigquery').BigQuery;
const constants = require("../../utils/constants");
const vm = require('vm');
const crypto = require('crypto');
const request = require("request");
const auth = require('../../utils/auth');
const redis = require("../../utils/redis").Redis;
const requestPromise = promisify(request);
const config = require("config");
const fetch = require('node-fetch');
const URLSearchParams = require('url').URLSearchParams;
const fs = require("fs");
const mongoConnecter = require("../../utils/mongo").Mongo.query;
const userQueryLogs = require("../accounts").userQueryLogs;
const getRole = require("../object_roles").get;
const ObjectId = require('mongodb').ObjectID;
const oracle = require('../../utils/oracle').Oracle;
const PromiseManager = require("../../utils/promisesManager").promiseManager;
const promiseManager = new PromiseManager("executingReports");
const pgsql = require("../../utils/pgsql").Postgres;
const child_process = require('child_process');
const {performance} = require('perf_hooks');

// prepare the raw data
class report extends API {

	async load(reportObj, filterList) {

		if (reportObj && filterList) {

			this.reportObj = reportObj;
			this.filterList = filterList;
			this.reportId = reportObj.query_id;
		}

		const objRole = new getRole();

		let reportDetails = [

			this.mysql.query(`
				SELECT
                  q.*,
                  IF(user_id IS NULL AND userDashboard.query_id IS NULL, 0, 1) AS flag,
                  c.type,
				  c.project_name
                FROM
				tb_query q
                JOIN
          			(
                		SELECT
                			query_id
                		FROM
                			tb_visualization_canvas vd
                		JOIN
                			tb_object_roles r
                			ON vd.owner_id = r.owner_id
                		JOIN
                			tb_query_visualizations qv
                			USING(visualization_id)
                		WHERE
                			target_id = ? -- user_id
                			AND query_id = ?
                			AND r.owner = 'dashboard'
                			AND target = 'user'
                			AND qv.is_enabled = 1
                			AND qv.is_deleted = 0
                			AND vd.owner = 'dashboard'
                		UNION ALL
                		SELECT
                			NULL AS query_id
                		LIMIT 1
                	) userDashboard
                JOIN
				(
				    SELECT
				        owner_id AS user_id
				    FROM
				        tb_object_roles o
				    WHERE
				        owner_id = ? -- query
				        AND target_id = ? -- user
				        AND o.owner = 'query'
				        AND target = 'user'

				    UNION ALL

				    SELECT
				        NULL AS user_id

					LIMIT 1
				) AS queryUser

				JOIN
					tb_credentials c
				ON
					q.connection_name = c.id

                WHERE
					q.query_id = ?
					AND is_enabled = 1
					AND is_deleted = 0
					AND q.account_id = ?
					AND c.status = 1
				`,

				[this.user.user_id, this.reportId, this.reportId, this.user.user_id, this.reportId, this.account.account_id, this.account.account_id],
			),

			this.mysql.query(`select * from tb_query_filters where query_id = ?`, [this.reportId]),

			objRole.get(this.account.account_id, "query", "role", this.reportId,)
		];

		reportDetails = await Promise.all(reportDetails);
		this.assert(reportDetails[0].length, "Report Id: " + this.reportId + " not found");

		if (this.request.body.visualization_id) {
			this.visualization = (await this.mysql.query(
				"select options from tb_query_visualizations where visualization_id = ? and query_id = ? and is_enabled = 1 and is_deleted = 0",
				[this.request.body.visualization_id, this.reportId]
			))[0]
		}

		if (this.visualization && commonFun.isJson(this.visualization.options)) {
			this.visualization.options = JSON.parse(this.visualization.options);
		}

		this.reportObj = reportDetails[0][0];
		this.filters = reportDetails[1] || [];

		this.reportObj.roles = [...new Set(reportDetails[2].map(x => x.target_id))];
		this.reportObj.category_id = [...new Set(reportDetails[2].map(x => x.category_id))];

		let [preReportApi] = await this.mysql.query(
			`select value from tb_settings where owner = 'account' and profile = 'pre_report_api' and owner_id = ?`,
			[this.account.account_id],
		);

		if (preReportApi && commonFun.isJson(preReportApi.value)) {

			for (const key of this.account.settings.get("external_parameters")) {

				if ((constants.filterPrefix + key) in this.request.body) {

					this.filters.push({
						placeholder: key.replace(constants.filterPrefix),
						value: this.request.body[constants.filterPrefix + key],
						default_value: this.request.body[constants.filterPrefix + key],
					})
				}
			}

			preReportApi = (JSON.parse(preReportApi.value)).value;

			let preReportApiDetails;

			try {
				preReportApiDetails = await requestPromise({

					har: {
						url: preReportApi,
						method: 'GET',
						headers: [
							{
								name: 'content-type',
								value: 'application/x-www-form-urlencoded'
							}
						],
						queryString: this.account.settings.get("external_parameters").map(x => {
							return {
								name: x,
								value: this.request.body[constants.filterPrefix + x],
							}
						})
					},
					gzip: true
				});
			}
			catch (e) {
				return {"status": false, data: "invalid request " + e.message};
			}

			preReportApiDetails = JSON.parse(preReportApiDetails.body).data[0];

			const filterMapping = {};

			for (const filter of this.filters) {

				if (!filterMapping[filter.placeholder]) {

					filterMapping[filter.placeholder] = filter;
				}
			}

			for (const key in preReportApiDetails) {

				const value = preReportApiDetails.hasOwnProperty(key) ? (new String(preReportApiDetails[key])).toString() : "";

				if (key in filterMapping) {

					filterMapping[key].value = value;
					filterMapping[key].default_value = value;
					continue;
				}

				filterMapping[key] = {
					placeholder: key,
					value: value,
					default_value: value
				}
			}

			this.filters = Object.values(filterMapping);
		}

		this.reportObj.query = this.request.body.query || this.reportObj.query;
	}

	async authenticate() {
		this.account.features.needs(this.reportObj.type + '-source');

		const authResponse = await auth.report(this.reportObj, this.user);

		if (this.request.body.query) {

			const objRole = new getRole();

			const possiblePrivileges = ["report.edit", constants.privilege.administrator, "superadmin"];

			const categories = (await objRole.get(this.account.account_id, 'query', 'role', this.request.body.query_id)).map(x => x.category_id);

			let userCategories = this.user.privileges.filter(x => possiblePrivileges.includes(x.privilege_name)).map(x => x.category_id);

			let flag = false;

			for (let category of categories) {

				category = category.map(x => x.toString());

				flag = flag || userCategories.every(x => category.includes(x.toString()));
			}

			flag = (flag && userCategories.length) || userCategories.some(x => constants.adminPrivilege.includes(x));
			flag = flag || this.user.privilege.has('superadmin') || this.reportObj.added_by == this.user.user_id;

			this.assert(flag, "Query not editable by user");
		}


		this.assert(!authResponse.error, "user not authorised to get the report");
	}

	prepareFiltersForOffset() {

		//filter fields required = offset, placeholder, default_value

		for (const filter of this.filters) {

			const date = new Date();

			if (isNaN(parseFloat(filter.offset))) {

				continue;
			}

			if (filter.type == 'time') {

				filter.default_value = new Date(date.getTime() + (1000 * filter.offset)).toTimeString().substring(0, 8);
				filter.value = this.request.body[constants.filterPrefix + filter.placeholder] || filter.default_value;

				if (filter.value >= new Date().toISOString().slice(11, 19)) {

					this.has_today = true;
				}
			}

			else if (filter.type == 'date') {

				filter.default_value = new Date(Date.now() + filter.offset * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
				filter.value = this.request.body[constants.filterPrefix + filter.placeholder] || filter.default_value;

				if (filter.value >= new Date().toISOString().slice(0, 10)) {
					this.has_today = true;

				}
			}

			else if (filter.type == 'month') {

				filter.default_value = new Date(Date.UTC(date.getFullYear(), date.getMonth() + filter.offset, 1)).toISOString().substring(0, 7);
				filter.value = this.request.body[constants.filterPrefix + filter.placeholder] || filter.default_value;

				if (filter.value >= new Date().toISOString().slice(0, 7)) {

					this.has_today = true;
				}
			}

			else if (filter.type == 'year') {

				filter.default_value = date.getFullYear() + parseFloat(filter.offset);
				filter.value = this.request.body[constants.filterPrefix + filter.placeholder] || filter.default_value;

				if (filter.value >= new Date().toISOString().slice(0, 4)) {

					this.has_today = true;
				}
			}

			else if (filter.type == 'datetime') {

				filter.default_value = new Date(Date.now() + filter.offset * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
				filter.value = this.request.body[constants.filterPrefix + filter.placeholder] || filter.default_value;

				if (filter.value >= new Date().toISOString().slice(0, 10)) {

					this.has_today = true;
				}
			}

		}

		for (const filter of this.filters) {

			filter.value = this.request.body[constants.filterPrefix + filter.placeholder] || filter.default_value;
		}
	}

	async storeQueryResultSetup() {

		if (this.reportObj.load_saved) {

			const userQueryLogsObj = new userQueryLogs();
			Object.assign(userQueryLogsObj, this);

			await userQueryLogsObj.userQueryLogs();

			this.queryResultDb = this.account.settings.get('load_saved_database');
			this.queryResultConnection = parseInt(this.account.settings.get('load_saved_connection'));

			this.assert(this.queryResultConnection, "connection id for loading saved result is not valid");
		}
	}

	async storeQueryResult(result) {

		if (this.reportObj.load_saved) {

			let [idToUpdate] = await this.mysql.query(
				"select max(id) as id from ??.?? where query_id = ? and type = ?",
				[this.queryResultDb, constants.saveQueryResultTable, this.reportObj.query_id, this.reportObj.type],

				this.queryResultConnection
			);

			if (idToUpdate && idToUpdate.id) {

				idToUpdate = idToUpdate.id;

				return await this.mysql.query(
					"update ??.?? set data = ? where query_id = ? and type = ? and id = ?",
					[this.queryResultDb, constants.saveQueryResultTable,
						JSON.stringify(result), this.reportObj.query_id, this.reportObj.type, idToUpdate],
					this.queryResultConnection
				);
			}

			else {

				return await this.mysql.query(
					"insert into ??.?? (query_id, type, user_id, query, data) values (?, ?, ?, ?, ?)",
					[
						this.queryResultDb, constants.saveQueryResultTable,
						this.reportObj.query_id, this.reportObj.type, this.user.user_id, this.reportObj.query || "",
						JSON.stringify(result)
					],
					this.queryResultConnection
				);
			}
		}

		else {
			return [];
		}
	}

	async report(queryId, reportObj, filterList) {

		this.request.body = {...this.request.body, ...this.request.query};

		this.reportId = this.request.body.query_id || queryId;
		this.reportObjStartTime = Date.now();
		const forcedRun = parseInt(this.request.body.cached) === 0;


		await this.load(reportObj, filterList);
		await this.authenticate();

		await this.storeQueryResultSetup();

		let result;

		if (this.reportObj.load_saved) {

			if (this.request.body.data) {

				this.assert(commonFun.isJson(this.request.body.data), "data for saving is not json");

				this.request.body.data = JSON.parse(this.request.body.data);

				await this.storeQueryResult(this.request.body.data);

				return {
					data: this.request.body.data,
					message: "saved"
				};
			}

			[result] = await this.mysql.query(`
				select
					*
				from
					??.??
				where
					query_id = ?
					and id =
						(
							select
								max(id)
							from
								??.??
							where
								query_id = ?
								and type = ?
						)
			`,
				[
					this.queryResultDb, "tb_save_history", this.reportObj.query_id, this.queryResultDb, "tb_save_history",
					this.reportObj.query_id, this.reportObj.type
				],
				parseInt(this.queryResultConnection),
			);

			if (result && result.data) {

				this.assert(commonFun.isJson(result.data), "result is not a json");

				result.data = JSON.parse(result.data);
				const age = Math.round((Date.now() - Date.parse(result.created_at)) / 1000);
				result = result.data;

				this.reportObj.data = result;
			}
		}

		this.prepareFiltersForOffset();

		let preparedRequest;

		switch (this.reportObj.type.toLowerCase()) {

			case "mysql":
				preparedRequest = new MySQL(this.reportObj, this.filters, this.request.body.token);
				break;
			case "mssql":
				preparedRequest = new MSSQL(this.reportObj, this.filters, this.request.body.token);
				break;
			case "api":
				preparedRequest = new APIRequest(this.reportObj, this.filters, this.request.body);
				break;
			case "pgsql":
				preparedRequest = new Postgres(this.reportObj, this.filters, this.request.body.token);
				break;
			case "bigquery":
				preparedRequest = new Bigquery(this.reportObj, this.filters, this.request.body.token);
				break;
			case "mongo":
				preparedRequest = new Mongo(this.reportObj, this.filters);
				break;
			case "oracle":
				preparedRequest = new Oracle(this.reportObj, this.filters);
				break;
			case "file":
				preparedRequest = new File(this.reportObj.data);
				break;
			case "bigquery_legacy":
				preparedRequest = new BigqueryLegacy(this.reportObj, this.filters);
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

		//Priority: Redis > (Saved Result)

		this.redis = (!forcedRun && parseInt(this.reportObj.is_redis) && redisData && !this.has_today);

		let cacheInfo;

		if (this.redis) {

			try {

				result = JSON.parse(redisData);

				// await this.storeQueryResult(result);

				await engine.log(this.reportObj.query_id, result.query,
					Date.now() - this.reportObjStartTime, this.reportObj.type,
					this.user.user_id, 1, JSON.stringify({filters: this.filters}), this.user.session_id
				);

				cacheInfo = {
					status: true,
					age: Date.now() - result.cached && result.cached.store_time
				}

				redis.cacheInfo = cacheInfo;
				return result;
			}
			catch (e) {
				throw new API.Exception(500, "Invalid Redis Data!");
			}
		}

		else {

			cacheInfo = {status: false};

			if (promiseManager.has(engine.hash)) {

				return await promiseManager.fetchAndExecute(engine.hash);
			}

			const engineExecution = engine.execute();

			const queryDetails = new Map;

			queryDetails.set("query", {id: this.reportObj.query_id, name: this.reportObj.name});
			queryDetails.set("account", {id: this.account.account_id, name: this.account.name});
			queryDetails.set("user", {id: this.user.user_id, name: this.user.name});
			queryDetails.set("execution_timestamp", new Date());
			queryDetails.set("params", engine.parameters);

			promiseManager.store(engineExecution, queryDetails, engine.hash);


			try {

				result = await engineExecution;

			}
			catch (e) {

				console.error(e.stack);

				if (e.message.includes("<!DOCTYPE")) {

					e.message = e.message.slice(0, e.message.indexOf("<!DOCTYPE")).trim();
				}

				throw new API.Exception(400, e.message);
			}

			finally {

				promiseManager.remove(engine.hash);
			}


			await engine.log(this.reportObj.query_id, result.query, result.runtime,
				this.reportObj.type, this.user.user_id, 0, JSON.stringify({filters: this.filters}), this.user.session_id
			);

			const EOD = new Date();
			EOD.setHours(23, 59, 59, 999);
		}

		const transformationData = [];

		let columnInfo = JSON.parse(this.reportObj.format);

		columnInfo = columnInfo.columns ? columnInfo.columns : [];

		if (!Array.isArray(columnInfo)) {

			columnInfo = [columnInfo];
		}

		for (const transformation of !this.visualization ? [] : this.visualization.options.transformations) {

			if (transformation.backend_transformation && transformations.has(transformation.type)) {

				const st = performance.now();
				let metadata = {};

				const transformationObj = new (transformations.get(transformation.type))(
					transformation.columns, result.data, columnInfo
				);
				const response = (await transformationObj.execute()).body;

				this.assert(response.status, response.response);

				[result.data, metadata] = Transformation.merge(result.data, response);

				transformationData.push({
					name: transformation.type,
					time_taken: performance.now() - st,
					...metadata
				});
			}
		}

		result.metadata = {
			transformations: transformationData,
		};

		cacheInfo.store_time = Date.now();

		if (redis && this.reportObj.is_redis && !this.redis) {

			await redis.set(hash, JSON.stringify(result));
			await redis.expire(hash, this.reportObj.is_redis);
		}

		result.cached = cacheInfo;

		return result;
	}
}


class SQL {

	constructor(reportObj, filters = [], token = null) {

		this.reportObj = reportObj;
		this.filters = filters;
		this.token = token;
	}

	prepareQuery() {

		this.reportObj.query = (this.reportObj.query || '')
			.replace(/--.*(\n|$)/g, "")
			.replace(/\s+/g, ' ');

		this.filterIndices = {};

		for (const filter of this.filters) {

			if (filter.type == "literal") {

				continue;
			}

			this.filterIndices[filter.placeholder] = {

				indices: (commonFun.getIndicesOf(`{{${filter.placeholder}}}`, this.reportObj.query)),
				value: filter.value,
			};
		}

		for (const filter of this.filters) {

			if (filter.type == "column") {

				this.reportObj.query = this.reportObj.query.replace(new RegExp(`{{${filter.placeholder}}}`, 'g'), "??");
				continue;
			}

			else if (filter.type == 'literal') {

				this.reportObj.query = this.reportObj.query.replace(new RegExp(`{{${filter.placeholder}}}`, 'g'), filter.value);
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


class MySQL extends SQL {

	constructor(reportObj, filters = [], token = null) {

		super(reportObj, filters, token);
	}

	get finalQuery() {

		this.prepareQuery();

		return {
			request: [this.reportObj.query, this.filterList || [], this.reportObj.connection_name,],
			type: "mysql"
		};
	}

}


class MSSQL extends SQL {

	constructor(reportObj, filters = [], token = null) {

		super(reportObj, filters, token);
	}

	get finalQuery() {

		this.prepareQuery();

		return {
			request: [this.reportObj.query, this.filterList || [], this.reportObj.connection_name,],
			type: "mssql"
		};
	}

}


class APIRequest {

	constructor(reportObj, filters = [], requestBody) {

		this.reportObj = reportObj;
		this.filters = filters;

		const filterSet = new Set;

		this.filters.forEach(x => filterSet.add(x.placeholder));

		for (const filter in requestBody) {

			this.filters.push({
				placeholder: filterSet.has(filter) ? `allspark_${filter}` : filter,
				value: requestBody[filter],
				default_value: requestBody[filter]
			});
		}
	}

	get finalQuery() {

		this.prepareQuery();

		if (this.definition.method === "GET") {

			return {
				request: [this.url, {...this.definition}],
				type: "api",
			}
		}

		return {
			request: [this.url, {body: this.parameters, ...this.definition}],
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

			this.definition = JSON.parse(this.reportObj.definition);
		}

		catch (e) {

			const err = Error("url options is not JSON");
			err.status = 400;
			return err;
		}

		this.url = this.definition.url;

		if (this.definition.method === 'GET') {

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


class Bigquery {

	constructor(reportObj, filters = []) {

		this.reportObj = reportObj;
		this.filters = filters;

		this.typeMapping = {
			"number": "integer",
			"text": "string",
			"date": "date",
			"month": "string",
			"hidden": "string",
			"datetime": "string"
		};
	}

	get finalQuery() {

		this.prepareQuery();

		return {
			type: "bigquery",
			request: [this.reportObj.query, this.filterList || [], this.reportObj.account_id, this.reportObj.connection_name + ".json", this.reportObj.project_name]
		}
	}

	makeFilters(data, name, type = "STRING", is_multiple = 0,) {


		let filterObj = {
			name: name
		};

		type = this.typeMapping[type];

		if (is_multiple) {

			filterObj.parameterType = {
				"type": "ARRAY",
				"arrayType": {
					"type": type.toUpperCase(),
				}
			};

			filterObj.parameterValue = {
				arrayValues: [],
			};

			if (!Array.isArray(data)) {

				data = [data]
			}

			for (const item of data) {

				filterObj.parameterValue.arrayValues.push({
					value: item
				});
			}
		}

		else {

			filterObj.parameterType = {
				type: type.toUpperCase(),
			};

			filterObj.parameterValue = {
				value: data,
			}
		}

		this.filterList.push(filterObj);
	}

	prepareQuery() {

		this.filterList = [];

		for (const filter of this.filters) {

			this.reportObj.query = this.reportObj.query.replace((new RegExp(`{{${filter.placeholder}}}`, "g")), `@${filter.placeholder}`);

			if (!filter.type) {
				try {

					if ((filter.value.match(/^-{0,1}\d+$/))) {

						filter.type = 'number';
					}
					else {

						filter.type = 'text';
					}
				}
				catch (e) {

					continue;
				}
			}

			this.makeFilters(filter.value, filter.placeholder, filter.type, filter.multiple);
		}
	}
}

class BigqueryLegacy {

	constructor(reportObj, filters = []) {

		this.reportObj = reportObj;
		this.filters = filters;
	}

	get finalQuery() {

		this.prepareQuery();

		return {
			type: "bigquery",
			request: [
				this.reportObj.query,
				this.filterList || [],
				this.reportObj.account_id,
				this.reportObj.connection_name + ".json",
				this.reportObj.project_name,
				true
			]
		}
	}

	prepareQuery() {

		this.filterList = [];

		for (const filter of this.filters) {

			if (Array.isArray(filter.value)) {

				if (filter.type == 'number') {

					this.reportObj.query = this.reportObj.query.replace((new RegExp(`{{${filter.placeholder}}}`, "g")), filter.value.map(x => parseInt(x)).join(', '));
				}
				else {

					this.reportObj.query = this.reportObj.query.replace((new RegExp(`{{${filter.placeholder}}}`, "g")), '"' + filter.value.join('", "') + '"');
				}
			}

			else {

				this.reportObj.query = this.reportObj.query.replace((new RegExp(`{{${filter.placeholder}}}`, "g")), `"${filter.value}"`);
			}
		}
	}
}


class Mongo {

	constructor(reportObj, filters) {

		this.reportObj = reportObj;
		this.filters = filters;

		reportObj.definition = JSON.parse(reportObj.definition);

		this.sandbox = {x: 1, ObjectId};
	}

	get finalQuery() {

		this.applyFilters();
		this.prepareQuery;

		return {
			type: "mongo",
			request: [this.reportObj.query, this.reportObj.definition.collection_name, this.reportObj.connection_name]
		}
	}

	applyFilters() {

		for (const filter of this.filters) {

			const regex = new RegExp(`{{${filter.placeholder}}}`, 'g');

			if (filter.multiple && !Array.isArray(filter.value)) {

				filter.value = [filter.value];
			}

			this.reportObj.query = this.reportObj.query.replace(regex, typeof filter.value == 'object' ? filter.placeholder : `'${filter.value}'`);
			this.sandbox[filter.placeholder] = filter.value;
		}
	}

	get prepareQuery() {

		vm.createContext(this.sandbox);

		const code = `x = ${this.reportObj.query}`;

		try {
			vm.runInContext(code, this.sandbox);
		}

		catch (e) {

			throw new API.Exception(400, {
				message: e.message,
				query: JSON.stringify(this.reportObj.query, 0, 1),
			})
		}

		this.reportObj.query = this.sandbox.x;

		if (!(this.reportObj.definition.collection_name && this.reportObj.query)) {

			throw("something missing in collection and aggregate query");
		}
	}
}


class Oracle {

	constructor(reportObj, filters = []) {

		this.reportObj = reportObj;
		this.filters = filters;
	}

	prepareQuery() {

		let queryParameters = {};

		for (const filter of this.filters) {

			if (!Array.isArray(filter.value)) {

				filter.value = [filter.value];
			}

			queryParameters = {...queryParameters, ...this.prepareParameters(filter)};
		}

		this.queryParameters = queryParameters;
	}


	prepareParameters(filter) {

		const filterObj = {}, containerArray = [];

		const regex = new RegExp(`{{${filter.placeholder}}}`, 'g');

		for (let position = 0; position < (this.reportObj.query.match(regex) || []).length; position++) {

			let tempArray = [];

			for (const [index, value] of filter.value.entries()) {

				const key = `${filter.placeholder}_${position}_${index}`;

				filterObj[key] = value;
				tempArray.push(":" + key);
			}

			containerArray.push(tempArray);
		}

		this.reportObj.query = this.reportObj.query.replace(regex, (() => {

			let number = 0;

			return () => (containerArray[number++] || []).join(", ");
		})());

		return filterObj;
	}

	get finalQuery() {

		this.prepareQuery();

		return {
			type: "oracle",
			request: [this.reportObj.query, this.queryParameters, this.reportObj.connection_name],
		}
	}
}

class File {

	constructor(data) {

		this.data = data;
	}

	get finalQuery() {

		return {
			type: "file",
			request: [this.data],
		};
	}
}


class ReportEngine extends API {

	constructor(parameters) {

		super();

		const fn = (data) => data;

		ReportEngine.engines = {
			mysql: this.mysql.query,
			pgsql: pgsql.query,
			api: fetch,
			bigquery: bigQuery.call,
			mssql: this.mssql.query,
			mongo: mongoConnecter,
			oracle: oracle.query,
			file: fn,
		};

		this.parameters = parameters || {};
	}

	get hash() {

		if (this.parameters.type === 'api' && this.parameters.request[1].body) {

			this.parameters.request[1].params = this.parameters.request[1].body.toString();
		}
		return crypto.createHash('sha256').update(JSON.stringify(this.parameters) || "").digest('hex');
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

		if (["mysql", "pgsql", "mssql", "oracle"].includes(this.parameters.type)) {

			query = data.instance ? data.instance.sql : data;
		}

		else if (this.parameters.type === "api") {

			query = this.parameters.request;

			data = await data.json();

			if (data && Array.isArray(data.data)) {

				data = data.data;
			}
		}

		else if (this.parameters.type === "mongo") {

			query = JSON.stringify(this.parameters.request[0], 0, 1);
		}
		else if (this.parameters.type == "file") {

			query = null;
		}

		return {
			data: data,
			runtime: (Date.now() - this.executionTimeStart),
			query: query,
		};
	}

	async log(query_id, result_query, executionTime, type, userId, is_redis, rows, session_id) {

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
						result_query,
						response_time,
						type,
						user_id,
						session_id,
						cache,
						\`rows\`,
						creation_date
					)
				VALUES
					(?,?,?,?,?,?,?,?, DATE(NOW()))`,
				[query_id, result_query, executionTime, type, userId, session_id, is_redis, rows],
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
		const [queryRow] = await this.mysql.query(
			"select * from tb_query where query_id = ? and account_id = ? and is_enabled = 1 and is_deleted = 0",
			[this.account.account_id, this.request.body.query_id]
		);

		this.assert(queryRow, "Query not found");

		this.assert(type, "credential id " + this.request.body.connection_id + " not found");

		const objRole = new getRole();

		const possiblePrivileges = ["report.edit", "admin", "superadmin"];

		const categories = (await objRole.get(this.account.account_id, 'query', 'role', this.request.body.query_id)).map(x => x.category_id);

		let userCategories = this.user.privileges.filter(x => possiblePrivileges.includes(x.privilege_name)).map(x => x.category_id);

		let flag = false;

		for (let category of categories) {

			category = category.map(x => x.toString());

			flag = flag || category.every(x => userCategories.includes(x.toString()));
		}

		flag = flag || this.user.privilege.has('superadmin') || queryRow.added_by == this.user.user_id;

		this.assert(flag, "Query not editable by user");

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
		excel_visualization = JSON.parse(excel_visualization);

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
							type: !this.request.body.classic_pie && excel_visualization.type == 'pie' ? {"type": "doughnut"} : excel_visualization,
						}
					},
					sheet_name: this.request.body.sheet_name.slice(0, 22) + "...",
					file_name: fileName.slice(0, 22) + "...",
					show_legends: this.request.body.show_legends,
					show_values: this.request.body.show_values,
				},
			]
		};

		if (config.has("allspark_python_base_api")) {

			const data = await download.jsonRequest(requestObj, config.get("allspark_python_base_api") + "xlsx/get");

			this.response.sendFile(data.body.response);
			throw({"pass": true})
		}
	}
}

class executingReports extends API {

	async executingReports() {

		const result = [];
		const superadmin = this.user.privilege.has("superadmin");
		const admin = this.user.privilege.has("admin");

		for (const value of promiseManager.list()) {

			let obj = {};

			if (!(superadmin || admin) && value.get("user_id") !== this.user.user_id) {

				continue;
			}

			if (!superadmin && admin && value.get("account_id") !== this.account.account_id) {

				continue;
			}

			for (const [k, v] of value.entries()) {

				if (k === "execute") {

					continue;
				}

				obj[k] = v;
			}

			result.push(obj)
		}

		return result;
	}
}

class CachedReports extends API {

	async cachedReports() {

		this.user.privilege.needs("superadmin");

		const
			allKeys = await redis.keys('*'),
			keyDetails = [],
			keyInfo = [],
			keyValues = [];

		for (const key of allKeys) {

			keyInfo.push(redis.keyInfo(key));
			keyValues.push(redis.get(key).catch(x => console.log(x)));
		}

		const
			sizeArray = await commonFun.promiseParallelLimit(5, keyInfo),
			keyArray = await commonFun.promiseParallelLimit(5, keyValues);

		for (const [index, value] of allKeys.entries()) {

			const keyDetail = {
				report_id: parseFloat(value.slice(value.indexOf('report_id') + 10)),
				size: sizeArray[index],
			};

			try {

				keyDetail.created_at = new Date(JSON.parse(keyArray[index]).cached.store_time);
			}

			catch (e) {
			}

			keyDetails.push(keyDetail);
		}

		keyDetails.sort((a, b) => a.size - b.size);

		return await commonFun.promiseParallelLimit(5, keyDetails);
	}
}

class Transformation {

	constructor(options, data, columnInfo) {
		this.options = options;
		this.data = data;
		this.columnInfo = columnInfo;
	}

	//originalData = result.data from query engine
	//metadata = result from transformations

	static merge(originalData, response) {

		let
			metadata = response.response.rows,
			connectingColumn = response.response.connecting_column || "timing";

		const newColumns = {};

		for(const column in metadata[0]) {

			if(column == connectingColumn) {

				continue;
			}

			for (const newColumn in metadata[0][column]) {

				newColumns[`${column}_${newColumn}`] = `${column}_${newColumn}_${commonFun.hashCode(column + newColumn)}`;

			}
		}

		const originalDataMapping = {};

		for(const row of originalData) {

			originalDataMapping[row[connectingColumn].replace('T', ' ').slice(0, 19)] = row;
		}

		const dashedArray = [];

		for(const row of metadata) {

			if(!originalDataMapping.hasOwnProperty(row[connectingColumn])) {

				dashedArray.push(row[connectingColumn]);
				originalDataMapping[row[connectingColumn]] = {};
			}

			for(const originalColumn in row) {

				const connectingCol = row[connectingColumn].replace('T', ' ').slice(0, 19);

				if(originalColumn == connectingColumn) {

					originalDataMapping[connectingCol][originalColumn] = connectingCol;
					continue;
				}

				for (const newColumn in row[originalColumn]) {

					originalDataMapping[connectingCol][newColumns[`${originalColumn}_${newColumn}`]] = parseFloat(row[originalColumn][newColumn]);
				}
			}
		}

		return [Object.values(originalDataMapping), {dashedArray, newColumns}];
	}
}

const transformations = new Map;

transformations.set('forecast', class Forecast extends Transformation {

	constructor(options, data, columnsInfo) {

		super(options, data, columnsInfo);
	}

	async execute() {

		const obj = {
			options: this.options,
			data: this.data,
			column_info: this.columnInfo
		};

		return await download.jsonRequest(obj, config.get("allspark_python_base_api") + "forecast/get");
	}
});

exports.query = query;
exports.report = report;
exports.ReportEngine = ReportEngine;
exports.Postgres = Postgres;
exports.APIRequest = APIRequest;
exports.download = download;
exports.executingReports = executingReports;
exports.cachedReports = CachedReports;