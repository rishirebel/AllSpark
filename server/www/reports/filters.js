const API = require('../../utils/api');
const auth = require('../../utils/auth');
const promisify = require('util').promisify;
const reportHistory = require('../../utils/reportLogs');
const request = require("request");
const requestPromise = promisify(request);
const commonFun = require('../../utils/commonFunctions');
const getRole = require("../object_roles").get;
const constants = require("../../utils/constants");
const ReportList = require('./report').list;

class Filters extends API {

	async insert({name, query_id, placeholder, description = null, order, default_value = '', offset, type = null, dataset, multiple = null} = {}) {

		this.assert(query_id, 'Query id is required');
		this.assert(name && placeholder, 'Name or placeholder is missing');

		let values = {
			name, query_id, placeholder, type, multiple, default_value, description, offset,
			order: isNaN(parseInt(order)) ? null : parseInt(order),
			dataset: isNaN(parseInt(dataset)) ? null : parseInt(dataset),
		};

		if ((await auth.report(query_id, this.user)).error) {

			throw new API.Exception(404, 'User not authenticated for this report');
		}

		const [queryRow] = await this.mysql.query(
			`select * from tb_query where query_id = ? and is_deleted = 0 and account_id = ?`,
			[query_id, this.account.account_id]
		);

		this.assert(queryRow, "Query for this filter is not found");

		const queryEditableResponse = await this.checkEditable(queryRow);

		this.assert(!queryEditableResponse.error, queryEditableResponse.message);

		if(!isNaN(parseInt(dataset))) {

			await this.datasetCycle(parseInt(query_id), parseInt(dataset));
		}

		const
			insertResponse = await this.mysql.query('INSERT INTO tb_query_filters SET  ?', [values], 'write'),
			[loggedRow] = await this.mysql.query(
				'SELECT * FROM tb_query_filters WHERE filter_id = ?',
				[insertResponse.insertId]
			),
			logs = {
				owner: 'filter',
				owner_id: insertResponse.insertId,
				state: JSON.stringify(loggedRow),
				operation: 'insert',
			};

		reportHistory.insert(this, logs);

		return insertResponse;
	}

	async update({filter_id, name, placeholder, description = null, order, default_value = '', offset, type = null, dataset, multiple = null} = {}) {

		this.assert(filter_id, 'Filter id is required');
		this.assert(name && placeholder, 'Name or placeholder is missing');

		let
			values = {
				name, placeholder, type, multiple, default_value, description, offset,
				order: isNaN(parseInt(order)) ? null : parseInt(order),
				dataset: isNaN(parseInt(dataset)) ? null : parseInt(dataset),
			},
			[filterQuery] = await this.mysql.query('SELECT * FROM tb_query_filters WHERE filter_id = ?', [filter_id]),
			compareJson = {};

		this.assert(filterQuery, 'Invalid filter id');
		this.assert(filterQuery.query_id != dataset, 'Dataset and query id cannot be same.');

		if ((await auth.report(filterQuery.query_id, this.user)).error) {

			throw new API.Exception(404, 'User not authenticated for this report');
		}

		const [queryRow] = await this.mysql.query(
			`select * from tb_query where query_id = ? and is_deleted = 0 and account_id = ?`,
			[filterQuery.query_id, this.account.account_id]
		);

		this.assert(queryRow, "Query for this filter is not found");

		const queryEditableResponse = await this.checkEditable(queryRow);

		this.assert(!queryEditableResponse.error, queryEditableResponse.message);

		for (const key in values) {

			compareJson[key] = filterQuery[key] == null ? null : filterQuery[key].toString();
			filterQuery[key] = values[key];
		}

		if (JSON.stringify(compareJson) == JSON.stringify(values)) {

			return 'New values are identical to the previous ones.';
		}

		if(!isNaN(parseInt(dataset))) {

			await this.datasetCycle(parseInt(filterQuery.query_id), parseInt(dataset));
		}

		const
			updateResponse = await this.mysql.query('UPDATE tb_query_filters SET ? WHERE filter_id = ?', [values, filter_id], 'write'),
			logs = {
				owner: 'filter',
				owner_id: filter_id,
				state: JSON.stringify(filterQuery),
				operation: 'update',
			};

		reportHistory.insert(this, logs);

		return updateResponse;
	}

	async delete({filter_id} = {}) {

		this.assert(filter_id, 'Filter id is required');

		const [filterQuery] = await this.mysql.query('SELECT * FROM tb_query_filters WHERE filter_id = ?', [filter_id]);

		this.assert(filterQuery, 'Invalid filter id');

		if ((await auth.report(filterQuery.query_id, this.user)).error) {

			throw new API.Exception(404, 'User not authenticated for this report');
		}

		const [queryRow] = await this.mysql.query(
			`select * from tb_query where query_id = ? and is_deleted = 0 and account_id = ?`,
			[filterQuery.query_id, this.account.account_id]
		);

		this.assert(queryRow, "Query for this filter is not found");

		const queryEditableResponse = await this.checkEditable(queryRow);

		this.assert(!queryEditableResponse.error, queryEditableResponse.message);

		const
			deleteResponse = await this.mysql.query('DELETE FROM tb_query_filters WHERE filter_id = ?', [filter_id], 'write'),
			logs = {
				owner: 'filter',
				owner_id: filter_id,
				state: JSON.stringify(filterQuery),
				operation: 'delete',
			};

		reportHistory.insert(this, logs);

		return deleteResponse;
	}

	async preReport() {

		let [preReportApi] = await this.mysql.query(
			`select value from tb_settings where owner = 'account' and profile = 'pre_report_api' and owner_id = ? AND status = 1`,
			[this.account.account_id],
		);

		if (!preReportApi || !commonFun.isJson(preReportApi.value)) {

			return [];
		}

		preReportApi = (JSON.parse(preReportApi.value)).value;

		let externalParameters = [];

		if(Array.isArray(this.account.settings.get("external_parameters"))) {

			externalParameters = this.account.settings.get("external_parameters");
		}

		let preReportApiDetails = await requestPromise({

			har: {
				url: preReportApi,
				method: 'GET',
				headers: [
					{
						name: 'content-type',
						value: 'application/x-www-form-urlencoded'
					}
				],
				queryString: externalParameters.map(x => {

					const paramValue = this.request.query[constants.external_parameter_prefix + x.name];

					return {
						name: x.name,
						value: paramValue == undefined ? x.value : paramValue
					}
				})
			},
			gzip: true
		});

		preReportApiDetails = JSON.parse(preReportApiDetails.body).data[0];

		const filterMapping = {};

		for (const key in preReportApiDetails) {

			const value = preReportApiDetails.hasOwnProperty(key) ? (new String(preReportApiDetails[key])).toString() : "";

			filterMapping[key] = {
				placeholder: key,
				value: value,
			}
		}

		return Object.values(filterMapping);
	}

	async datasetCycle(query_id, dataset) {

		let reportListObj = new ReportList(this);

		let filterList = (await reportListObj.list())
			.reduce((a, b) => a.concat(b.filters), [])
			.filter(x => x.dataset);

		this.filterMap = new Map();

		this.filterMap.set(query_id, [dataset])

		for(const filter of filterList) {

			if(!this.filterMap.has(filter.query_id)) {

				this.filterMap.set(filter.query_id, []);
			}

			this.filterMap.get(filter.query_id).push(filter.dataset);
		}

		const
			visited = new Set();

		this.assert(!this.hasCycle(query_id, visited), 'Cycle detected');

		return true;
	}

	hasCycle(node, visited) {

		if(visited.has(node)) {

			return true;
		}

		visited.add(node);

		const visitedNew = new Set(visited);

		for(const adjNode of this.filterMap.get(node) || []) {

			if(this.hasCycle(adjNode, visitedNew)) {

				return true;
			}
		}

		visited.delete(node);

		return false;
	}

	async checkEditable(reportObj) {

		const objRole = new getRole();

		const possiblePrivileges = ["report.update", constants.privilege.administrator, "superadmin"];

		const categories = (await objRole.get(this.account.account_id, 'query', 'role', reportObj.query_id)).map(x => x.category_id);

		let userCategories = this.user.privileges.filter(x => possiblePrivileges.includes(x.privilege_name)).map(x => x.category_id);

		let flag = false;

		for (let category of categories) {

			category = category.map(x => x.toString());

			flag = flag || userCategories.every(x => category.includes(x.toString()));
		}

		flag = (flag && userCategories.length) || userCategories.some(x => constants.adminPrivilege.includes(x));
		flag = flag || this.user.privilege.has('superadmin') || reportObj.added_by == this.user.user_id;

		return {
			error: !flag,
			message: `User ${flag ? "can" : "can't"} edit the report`
		}
	}
}

exports.insert = Filters;
exports.update = Filters;
exports.delete = Filters;
exports.preReport = Filters;