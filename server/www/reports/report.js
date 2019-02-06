"use strict";

const API = require('../../utils/api');
const auth = require('../../utils/auth');
const role = new (require("../object_roles")).get();
const reportHistory = require('../../utils/reportLogs');
const constants = require("../../utils/constants");
const dbConfig = require('config').get("sql_db");
const {performance} = require('perf_hooks');

exports.list = class extends API {

	async list() {
		const st = performance.now();
		let query = `
			SELECT
				q.*,
				CONCAT_WS(' ', u.first_name, u.last_name) AS added_by_name,
				c.added_by as connection_added_by
			FROM
				tb_query q
			JOIN
				tb_credentials c
			ON
			    q.connection_name = c.id
			LEFT JOIN
				tb_users u
			ON
				q.added_by = u.user_id AND u.status = 1
			WHERE
				is_deleted = 0
				and q.account_id = ${this.account.account_id}
        `;

		const dashboardRoleQuery = `
			SELECT
				q.query_id,
				o.*
			FROM
				tb_query q
			JOIN
				tb_query_visualizations qv
				USING(query_id)
			JOIN
				tb_visualization_canvas vd
				USING(visualization_id)
			JOIN
				tb_object_roles o
			ON
				o.owner_id = vd.owner_id
			JOIN
				tb_dashboards d
			ON
				d.id = o.owner_id
			WHERE
				o.owner = "dashboard"
				AND o.target = "role"
				AND q.is_enabled = 1
				AND q.is_deleted = 0
				AND d.account_id = ?
				AND d.status = 1
				AND vd.owner = 'dashboard'
		`;

		const dashboardToReportAccessQuery = `
			SELECT
                query_id
            FROM
                tb_query q
            JOIN
                tb_query_visualizations qv
                USING(query_id)
            JOIN
                tb_visualization_canvas vd
                USING(visualization_id)
            JOIN
                tb_object_roles o
            ON
                o.owner_id = vd.owner_id
            JOIN
                tb_dashboards d
            ON
                d.id = o.owner_id
            WHERE
                 o.owner = "dashboard"
                 AND target = "user"
                 AND target_id = ?
                 AND qv.is_enabled = 1
                 and qv.is_deleted = 0
                 AND d.status = 1
                 AND vd.owner = 'dashboard'
            GROUP BY query_id
		`;

		const transformationQuery = `
			SELECT
				ot.id,
				ot.owner,
				ot.owner_id,
				ot.type,
				ot.order,
				ot.title,
				ot.options
			FROM
				tb_object_transformation ot
			JOIN
				tb_query_visualizations qv
				ON qv.visualization_id = ot.owner_id
			JOIN
				tb_query q
				ON qv.query_id = q.query_id
			WHERE
				ot.is_enabled = 1
				AND q.is_deleted = 0
				AND q.account_id = ?
				AND ot.owner = 'visualization'
			UNION ALL
			SELECT
				ot.id,
				ot.owner,
				ot.owner_id,
				ot.type,
				ot.order,
				ot.title,
				ot.options
			FROM
				tb_object_transformation ot
			JOIN
				tb_query q
				ON ot.owner_id = q.query_id
			WHERE
				ot.is_enabled = 1
				AND q.is_deleted = 0
				AND q.account_id = ?
				AND ot.owner = 'query'
		`;

		if (this.request.body.search) {
			query = query.concat(`
				AND (
					query_id LIKE ?
					OR name LIKE ?
					OR tags LIKE ?
				)
				LIMIT 10
			`);
		}

		let credentialObjectRoles = role.get(this.account.account_id, 'connection', ['user', 'role']);

		let userUpdateCategories = new Set(this.user.privileges.filter(x => [constants.privilege.administrator, constants.privilege["report.update"]].includes(x.privilege_name)).map(x => x.category_id));
		let userDeleteCategories = new Set(this.user.privileges.filter(x => [constants.privilege.administrator, constants.privilege["report.delete"]].includes(x.privilege_name)).map(x => x.category_id));

		let
			isAdmin = this.user.privilege.has('superadmin'),
			editable = this.user.privilege.has('superadmin'),
			deletable = this.user.privilege.has('superadmin')
		;

		if (constants.adminPrivilege.some(x => userUpdateCategories.has(x))) {

			userUpdateCategories = new Set([0]);
			editable = true;
		}

		if (constants.adminPrivilege.some(x => userDeleteCategories.has(x))) {

			userDeleteCategories = new Set([0]);
			deletable = true;
		}

		const results = await Promise.all([

			this.mysql.query(query, [`%${this.request.body.text}%`, `%${this.request.body.text}%`, `%${this.request.body.text}%`]),

			this.mysql.query(`
				SELECT
					qf.*
				FROM
					tb_query_filters qf
				JOIN
					tb_query q
					using(query_id)
				WHERE
					q.is_enabled = 1
					AND q.is_deleted = 0
					AND q.account_id = ?
				`,
				[this.account.account_id]
			),
			this.mysql.query(`
				SELECT
					qv.*,
					id,
					owner,
					owner_id,
					vc.visualization_id AS sub_visualization_id,
					vc.format as sub_visualization_format,
					CONCAT_WS(' ', u.first_name, u.last_name) AS added_by_name
				FROM
					tb_query_visualizations qv
				JOIN
					tb_query q
				ON
					qv.query_id = q.query_id
				LEFT JOIN
					tb_users u
				ON
					u.user_id = qv.added_by AND u.status = 1
				LEFT JOIN
					tb_visualization_canvas vc
				ON
					vc.owner_id = qv.visualization_id AND vc.owner = 'visualization'
				WHERE
					qv.is_enabled = 1
					AND qv.is_deleted = 0
					AND q.is_enabled = 1
					AND q.is_deleted = 0
					AND q.account_id = ?
				`,
				[this.account.account_id]
			),

			this.mysql.query(dashboardRoleQuery, [this.account.account_id]),

			this.mysql.query(dashboardToReportAccessQuery, [this.user.user_id]),

			credentialObjectRoles,

			this.mysql.query(transformationQuery, [this.account.account_id, this.account.account_id]),
		]);

		const transformations = {};

		for (const row of results[6]) {

			if (!transformations.hasOwnProperty(row.owner)) {

				transformations[row.owner] = {};
			}

			if (!transformations[row.owner].hasOwnProperty(row.owner_id)) {

				transformations[row.owner][row.owner_id] = [];
			}

			transformations[row.owner][row.owner_id].push(row);
		}

		const groupIdObject = {};

		for (const row of results[3]) {

			if (!groupIdObject.hasOwnProperty(row.query_id)) {

				groupIdObject[row.query_id] = {};
			}

			if(!groupIdObject[row.query_id].hasOwnProperty(row.group_id)) {

				groupIdObject[row.query_id][row.group_id] = {...row, category_id: [row.category_id]}
			}

			else {

				groupIdObject[row.query_id][row.group_id].category_id.push(row.category_id)
			}
		}

		let tempArr = [];

		for(const row of Object.values(groupIdObject)) {

			tempArr = tempArr.concat(...Object.values(row))
		}

		results[3] = tempArr;

		const visualizationRolesFromQuery = this.account.settings.has("visualization_roles_from_query") ? this.account.settings.get("visualization_roles_from_query") : !this.account.settings.has("visualization_roles_from_query");

		let [reportRoles, visualizationRoles, visualizationUsers, userSharedQueries] = await Promise.all([
			role.get(this.account.account_id, "query", "role", results[0].length ? results[0].map(x => x.query_id) : [-1],),
			visualizationRolesFromQuery ? Promise.resolve([]) : role.get(this.account.account_id, "visualization", "role",),
			visualizationRolesFromQuery ? Promise.resolve([]) : role.get(this.account.account_id, "visualization", "user",),
			role.get(this.account.account_id, "query", "user", results[0].length ? results[0].map(x => x.query_id) : [-1], this.user.user_id)
		]);

		const dashboardSharedQueries = new Set(results[4].map(x => parseInt(x.query_id)));

		credentialObjectRoles = results[5];

		const reportRoleMapping = {};

		const visualizationQueryMapping = {}, visualizationMapping = {}, formattedVisualization = {};

		for (const visualization of results[2]) {

			visualizationMapping[visualization.visualization_id] = visualization;
		}


		for (const visualization of results[2]) {

			if (!visualizationQueryMapping.hasOwnProperty(visualization.query_id)) {

				visualizationQueryMapping[visualization.query_id] = new Map();
			}

			if(!visualizationQueryMapping[visualization.query_id].has(visualization.visualization_id)) {

				visualizationQueryMapping[visualization.query_id].set(visualization.visualization_id, visualization);
			}

			if(visualization.sub_visualization_id) {

				visualizationQueryMapping[visualization.query_id].set(
					''.concat(visualization.sub_visualization_id, ' : ', visualization.owner_id),
					{
						...visualizationMapping[visualization.sub_visualization_id],
						owner_id: visualization.visualization_id,
						format: visualization.sub_visualization_format,
						owner: visualization.owner,
						id: visualization.id,
						related: 1,
					}
				);
			}
		}

		if(visualizationRolesFromQuery) {

			visualizationRoles = [];
			visualizationUsers = [];

			for(const row of reportRoles || []) {

				for(const vis of (visualizationQueryMapping[row.owner_id] ? visualizationQueryMapping[row.owner_id].values() : [])) {

					const obj = JSON.parse(JSON.stringify(row));

					obj.owner_id = vis.visualization_id;
					obj.owner = 'visualization';

					visualizationRoles.push(obj);
				}
			}

			for(const row of userSharedQueries || []) {

				for(const vis of (visualizationQueryMapping[row.owner_id] ? visualizationQueryMapping[row.owner_id].values() : [])) {

					const obj = JSON.parse(JSON.stringify(row));
					obj.owner_id = vis.visualization_id;
					obj.owner = 'visualization';

					visualizationUsers.push(obj);
				}
			}
		}

		userSharedQueries = new Set(userSharedQueries.map(x => x.owner_id));

		for(const visualizationRole of visualizationRoles) {

			if(!visualizationMapping[visualizationRole.owner_id]) {

				continue;
			}

			if(!visualizationMapping[visualizationRole.owner_id].hasOwnProperty("roles")) {

				visualizationMapping[visualizationRole.owner_id].roles = [];
			}

			visualizationMapping[visualizationRole.owner_id].roles.push(visualizationRole);
		}

		for(const visualizationUser of visualizationUsers) {

			if(!visualizationMapping[visualizationUser.owner_id]) {

				continue;
			}

			if(!visualizationMapping[visualizationUser.owner_id].hasOwnProperty("users")) {

				visualizationMapping[visualizationUser.owner_id].users = [];
			}

			visualizationMapping[visualizationUser.owner_id].users.push(visualizationUser);
		}

		const queryFilterMapping = {};

		for (const filter of results[1]) {

			if (!queryFilterMapping.hasOwnProperty(filter.query_id)) {

				queryFilterMapping[filter.query_id] = [];
			}

			try {
				filter.offset = JSON.parse(filter.offset);
			} catch(e) {
				filter.offset = {};
			}

			queryFilterMapping[filter.query_id].push(filter);
		}

		for (const row of reportRoles) {

			if (!reportRoleMapping[row.owner_id]) {

				reportRoleMapping[row.owner_id] = {
					roles: [],
					category_id: [],
					dashboard_roles: [],
				};
			}

			reportRoleMapping[row.owner_id].roles.push(row.target_id);
			reportRoleMapping[row.owner_id].category_id.push(row.category_id);
		}

		for (const queryDashboardRole of results[3]) {

			if (!reportRoleMapping[queryDashboardRole.query_id]) {

				reportRoleMapping[queryDashboardRole.query_id] = {
					roles: null,
					category_id: null,
					dashboard_roles: [],
				};
			}

			reportRoleMapping[queryDashboardRole.query_id].dashboard_roles.push(queryDashboardRole);
		}

		const connectionMapping = {};

		for (const row of credentialObjectRoles) {

			if (!connectionMapping[row.owner_id]) {

				connectionMapping[row.owner_id] = {
					role: [],
					users: [],
					account_id: this.account.account_id,
					id: row.owner_id
				}
			}

			if (row.target == 'role') {

				connectionMapping[row.owner_id]["role"].push(row);
			}

			if (row.target == 'user' && row.target_id == this.user.user_id) {

				connectionMapping[row.owner_id]["users"].push(row);
			}
		}

		const response = new Map;

		const e = performance.now() - st;

		let
			reportTime = 0,
			reportCount = 0,
			visualizationTime = 0,
			visualizationCount = 0
		;

		for (const row of results[0]) {

			row.roles = (reportRoleMapping[row.query_id] || {}).roles || [];
			row.category_id = (reportRoleMapping[row.query_id] || {}).category_id || [];

			row.flag = userSharedQueries.has(row.query_id) || dashboardSharedQueries.has(row.query_id);

			row.transformations = transformations['query'] ? transformations['query'][row.query_id] : [];

			if (!connectionMapping[row.connection_name]) {

				row.connectionObj = {
					role: [],
					users: [],
					account_id: this.account.account_id,
					id: row.connection_name
				}
			}

			else {

				row.connectionObj = connectionMapping[row.connection_name];
			}

			row.connectionObj.added_by = row.connection_added_by;

			const s = performance.now();
			const authResponse = await auth.report(row, this.user, (reportRoleMapping[row.query_id] || {}).dashboard_roles || []);

			reportTime += performance.now() - s;
			reportCount++;

			if (authResponse.error) {

				continue;
			}

			if(row.tags) {

				row.tags = row.tags.split(',').map(t => t.trim()).filter(t => t).join(', ');
			}

			row.visibilityReason = authResponse.message;

			row.editable = isAdmin || editable;
			row.deletable = isAdmin || deletable;

			for(const categoryIds of row.category_id) {

				row.editable = row.editable || categoryIds.every(x => userUpdateCategories.has(x));
			}

			for(const categoryIds of row.category_id) {

				row.deletable = row.deletable || categoryIds.every(x => userDeleteCategories.has(x));
			}

			row.editable = (row.editable && (row.category_id.length || (isAdmin || editable))) || row.added_by == this.user.user_id;
			row.deletable = (row.deletable && (row.category_id.length || (isAdmin || deletable))) || row.added_by == this.user.user_id;

			if(!row.editable) {

				delete row.query;
			}

			row.filters = queryFilterMapping[row.query_id] || [];
			row.visualizations = [];

			const allVisualizations = [], relatedVisualizationMapping = {};

			for (const visualization of (visualizationQueryMapping[row.query_id] ? visualizationQueryMapping[row.query_id].values() : [])) {

				if(!visualization.roles) {

					visualization.roles = []
				}

				if(!visualization.users) {

					visualization.users = [];
				}
				let e1 = performance.now();
				const visualizationAuthResponse = await auth.visualization(visualization, this.user, [row, this.user, (reportRoleMapping[row.query_id] || {}).dashboard_roles || []], visualizationRolesFromQuery);
				visualizationTime += performance.now() - e1;
				visualizationCount++;

				if(visualizationAuthResponse.error) {

					continue;
				}

				const visualizationCategories = visualization.roles.map(x => x.category_id);

				const userVisualizationUpdateCategories = new Set(this.user.privileges.filter(x => [constants.privilege['visualization.update']].includes(x.privilege_name)).map(x => x.category_id));
				const userVisualizationDeleteCategories = new Set(this.user.privileges.filter(x => [constants.privilege['visualization.delete']].includes(x.privilege_name)).map(x => x.category_id));

				const updateFlag = this.user.privilege.has('visualization.update', 'ignore');
				const deleteFlag = this.user.privilege.has('visualization.delete', 'ignore');

				visualization.editable = isAdmin || updateFlag || visualization.added_by == this.user.user_id;
				visualization.deletable = isAdmin || deleteFlag || visualization.added_by == this.user.user_id;

				if(!(visualization.editable || visualization.deletable)) {

					for (const categoryIds of visualizationCategories) {

						visualization.editable = visualization.editable || categoryIds.every(x => userVisualizationUpdateCategories.has(x));
						visualization.deletable = visualization.deletable || categoryIds.every(x => userVisualizationDeleteCategories.has(x));
					}
				}

				visualization.visibilityReason = visualizationAuthResponse.message;

				if(visualization.related) {

					if(!relatedVisualizationMapping[visualization.owner_id]) {

                        relatedVisualizationMapping[visualization.owner_id] = [];
					}

                    relatedVisualizationMapping[visualization.owner_id].push({
	                    id: visualization.id,
	                    query_id: visualization.query_id,
	                    owner_id: visualization.owner_id,
	                    owner: visualization.owner,
	                    visualization_id: visualization.visualization_id,
	                    format: visualization.format
                    });
				}

				allVisualizations.push(visualization);
			}

			for(const visualization of allVisualizations) {

				if(visualization.related) {

					continue;
				}

				visualization.related_visualizations = relatedVisualizationMapping[visualization.visualization_id]
				? relatedVisualizationMapping[visualization.visualization_id]
				: [];

				const visualization_transformations = transformations['visualization']
				? transformations['visualization'][visualization.visualization_id]
				: [];

				let visualization_options = {};

				try {

					visualization_options = JSON.parse(visualization.options);
					visualization_options.transformations = [];

					visualization_transformations.sort( (a, b) => {
						return a.order - b.order;
					});
				}
				catch(e) {

					if(!visualization_options) {
						visualization_options = {};
						visualization_options.transformations = [];
					}
				}

				for (const transformation of visualization_transformations || []) {

					try {

						transformation.options = JSON.parse(transformation.options);
						visualization_options.transformations.push(transformation);
					}
					catch(e) {}
				}

				visualization.options = JSON.stringify(visualization_options);

				row.visualizations.push(visualization);
			}

			row.href = `/report/${row.query_id}`;
			row.superset = 'Reports';

			try {

				row.definition = JSON.parse(row.definition);
			}

			catch (e) {

				row.definition = {};
			}

			try {

				row.format = row.format ? JSON.parse(row.format) : null;
			}

			catch (e) {

				row.format = null;
			}

			response.set(row.query_id, row);
		}

		for(const row of response.values()) {

			delete row.connectionObj;

			for(const vis of row.visualizations) {

				let l =  vis.related_visualizations.length;

				while(l--) {

					if(!response.has(vis.related_visualizations[l].query_id)) {

						vis.related_visualizations.splice(l, 1);
					}
				}
			}
		}

		return [...response.values()];
	}
};

exports.delete = class extends API {

	async delete() {

		let [categories, [updatedRow], queryUsers] = await Promise.all([
			role.get(this.account.account_id, 'query', 'role', this.request.body.query_id),
			this.mysql.query(`SELECT * FROM tb_query WHERE query_id = ?`, [this.request.body.query_id]),
			role.get(this.account.account_id, 'query', 'user', this.request.body.query_id),
		]);

		categories = categories.map(x => x.category_id);

		let flag = this.user.privilege.has('superadmin') || queryUsers.filter(x => x.target_id == this.user.user_id).length;

		for (const categoryList of categories || [0]) {

			let categoryFlag = false;

			for(const category of categoryList) {

				categoryFlag = categoryFlag || this.user.privilege.has("report.delete", category);
			}

			flag = flag || categoryFlag;
		}

		this.assert(flag || updatedRow.added_by == this.user.user_id, "User cannot delete the report");

		const
			deletedRow = await this.mysql.query('UPDATE tb_query SET is_deleted = 1 WHERE query_id = ? AND account_id = ?', [this.request.body.query_id, this.account.account_id], 'write'),
			logs = {
				owner: 'query',
				owner_id: this.request.body.query_id,
				operation: 'delete',
			};

		reportHistory.insert(this, logs);

		return deletedRow;
	}
}

exports.update = class extends API {

	async update() {

		let [categories, [updatedRow], queryUsers] = await Promise.all([
			role.get(this.account.account_id, 'query', 'role', this.request.body.query_id),
			this.mysql.query(`SELECT * FROM tb_query WHERE query_id = ?`, [this.request.body.query_id]),
			role.get(this.account.account_id, 'query', 'user', this.request.body.query_id),
		]);

		categories = categories.map(x => x.category_id);

		let flag = this.user.privilege.has('superadmin') || queryUsers.filter(x => x.target_id == this.user.user_id).length;

		for (const categoryList of categories || [0]) {

			let categoryFlag = false;

			for(const category of categoryList) {

				categoryFlag = categoryFlag || this.user.privilege.has("report.update", category);
			}

			flag = flag || categoryFlag;
		}

		this.assert(flag || updatedRow.added_by == this.user.user_id, "User cannot update the report");

		this.assert(updatedRow, 'Invalid query id');

		let
			values = {},
			compareJson = {},
			query_cols = [
				'name',
				'source',
				'query',
				'definition',
				'subtitle',
				'description',
				'added_by',
				'tags',
				'is_enabled',
				'is_deleted',
				'is_redis',
				'load_saved',
				'refresh_rate',
				'format',
				'connection_name',
			];

		for (const key in this.request.body) {

			if (query_cols.includes(key)) {

				values[key] = this.request.body[key] || null;
				compareJson[key] = updatedRow[key] == null || updatedRow[key] === '' ? null : updatedRow[key].toString();
				updatedRow[key] = this.request.body[key];
			}
		}

		if (JSON.stringify(compareJson) == JSON.stringify(values)) {

			return 'New values are identical to the previous ones.';
		}

		if("refresh_rate" in values) {

            values.refresh_rate = parseInt(values.refresh_rate) || null;
		}

		if (values.hasOwnProperty("format")) {

			try {

				values.format = values.format ? JSON.stringify(JSON.parse(values.format)) : null;
			}
			catch (e) {

				values.format = JSON.stringify({});
			}

		}

		const
			updateResponse = await this.mysql.query('UPDATE tb_query SET ? WHERE query_id = ? and account_id = ?', [values, this.request.body.query_id, this.account.account_id], 'write'),
			logs = {
				owner: 'query',
				owner_id: this.request.body.query_id,
				state: JSON.stringify(updatedRow),
				operation: 'update',
			};

		reportHistory.insert(this, logs);

		return updateResponse;
	}
};

exports.insert = class extends API {

	async insert() {

		this.user.privilege.needs('report.insert', parseInt(this.request.body.subtitle));

		let
			values = {}, query_cols = [
				'account_id',
				'name',
				'source',
				'query',
				'definition',
				'subtitle',
				'description',
				'added_by',
				'tags',
				'is_enabled',
				'is_deleted',
				'is_redis',
				'load_saved',
				'refresh_rate',
				'format',
				'connection_name',
			];

		for (const key in this.request.body) {
			if (query_cols.includes(key))
				values[key] = this.request.body[key];
		}

		values["account_id"] = this.account.account_id;
		values.added_by = this.user.user_id;
		values.refresh_rate = parseInt(values.refresh_rate) || null;

		try {
			values.format = JSON.stringify(JSON.parse(values.format))
		} catch (e) {
			values.format = JSON.stringify({});
		}

		const
			insertResponse = await this.mysql.query('INSERT INTO tb_query SET  ?', [values], 'write'),
			[loggedRow] = await this.mysql.query(
				'SELECT * FROM tb_query WHERE query_id = ?',
				[insertResponse.insertId]
			),
			logs = {
				owner: 'query',
				owner_id: insertResponse.insertId,
				state: JSON.stringify(loggedRow),
				operation: 'insert',
			};

		reportHistory.insert(this, logs);

		return insertResponse;
	}
};

exports.logs = class extends API {

	async logs({offset = 0, owner, owner_id} = {}) {

		const db = dbConfig.write.database.concat('_logs');

		this.assert(owner && owner_id, 'Owner or Owner Id missing');

		return await this.mysql.query(`
			SELECT
				h.*,
				CONCAT_WS(' ', first_name, middle_name, last_name) AS user_name
			FROM
				${db}.tb_history h
			LEFT JOIN
				tb_users u
			ON
				h.user_id = u.user_id AND u.status = 1
			WHERE
				owner = ?
				AND h.account_id = ?
				AND owner_id = ?
			ORDER BY
				h.id DESC
			LIMIT 10 OFFSET ?`,
			[owner, this.account.account_id, owner_id, parseInt(offset)]
		);
	}
}

exports.userPrvList = class extends API {

	async userPrvList() {

		this.user.privilege.needs("administrator");

		const reportId = this.request.query.report_id;
		const privilegedUsers = [];

		const users = await this.mysql.query(`
			SELECT

				user.*,
				IF(dashboard_user.query_id_from_dashboards IS NULL AND user_query.query_id_from_user_query IS NULL, 0, 1) AS flag
			FROM
               (SELECT
                    'privileges' AS 'owner',
                    user_id,
                    concat_ws(" ",first_name, middle_name, last_name) AS \`name\`,
                    email,
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
                    u.account_id = ?
                    AND u.status = 1
                UNION ALL

               SELECT
                    'roles' AS 'owner',
                    u.user_id,
                    concat_ws(" ",first_name, middle_name, last_name) AS \`name\`,
                    email,
                    IF(r.is_admin = 1, 0, r.role_id) AS owner_id,
                    r.name AS role_name,
                    IF(c.is_admin = 1, 0, c.category_id) AS category_id,
                    c.name AS category_name
               FROM
                    tb_object_roles o
               JOIN
                    tb_users u
                    ON u.user_id = o.owner_id
               JOIN
                    tb_categories c
                    USING(category_id)
               JOIN
                    tb_roles r
                    ON r.role_id = o.target_id
               WHERE
                    u.account_id = ?
                    AND o.account_id = ?
                    AND o.owner = "user"
                    AND o.target = "role"
                    AND u.status = 1
               ) user
               LEFT  JOIN
                    (
                		SELECT
                			query_id AS query_id_from_dashboards,
                			user_id
                		FROM
                			tb_visualization_canvas vd
                		JOIN
                			tb_user_dashboard ud
                		ON
                			vd.owner_id = ud.dashboard_id
                		JOIN
                			tb_query_visualizations qv
                			USING(visualization_id)
                		WHERE
                			 query_id = ?
                			 and qv.is_enabled = 1
                			 and qv.is_deleted = 0
                			 AND vd.owner = 'dashboard'
                	) dashboard_user
               USING(user_id)
                	LEFT JOIN
                   	(
                   		SELECT
                   			query_id AS query_id_from_user_query,
                   			user_id
                   		FROM
                   			tb_user_query
                   		WHERE
                   			query_id = ?
                   ) user_query
               USING(user_id)
		`,
			[this.account.account_id, this.account.account_id, this.account.account_id, reportId, reportId]);


		const userObj = {};

		for (const row of users) {

			if (!userObj[row.user_id]) {

				userObj[row.user_id] = {

					name: row.name,
					email: row.email,
					user_id: row.user_id,
					account_id: this.account.account_id,
					roles: [],
					privileges: [],
					flag: row.flag,
				}
			}

			if (row.owner === "privileges") {

				userObj[row.user_id].privileges.push({
					category_id: row.category_id,
					privilege_id: row.owner_id,
					privilege_name: row.owner_name
				})
			}

			else if (row.owner === "roles") {

				userObj[row.user_id].roles.push({
					category_id: row.category_id,
					role: row.owner_id,
					role_name: row.owner_name
				})
			}
		}// User Details


		const reportDetails = await this.mysql.query(`
				SELECT
                  q.*
                FROM
                    tb_query q
                WHERE
                    q.query_id = ?
                    AND is_enabled = 1
                    AND is_deleted = 0
                    AND account_id = ?`,
			[reportId, this.account.account_id]
		);

		//queryDetails


		for (const user in userObj) {

			const authResponse = await auth.report({...reportDetails[0], flag: userObj[user].flag}, userObj[user]);
			if (!authResponse.error) {

				delete userObj[user].roles;
				delete userObj[user].privileges;
				privilegedUsers.push({...userObj[user], reason: authResponse.message});
			}
		}
		return privilegedUsers;

	}
};