const internalReports = new Map();

class InternalReport {

	get json() {

		return this;
	}
}

internalReports.set(1, class ActiveUsers extends InternalReport {

	constructor() {

		super();

		Object.assign(this, {
			internal: true,
			query_id: 1,
			name: 'Logs',
			source: 'query',
			query: 'SELECT creation_date AS timing, COUNT(l.id) as reports_loaded, COUNT(DISTINCT user_id) AS active_users FROM {{logs_db}}.tb_report_logs l JOIN tb_query q USING(query_id) WHERE account_id = {{account_id}} AND l.created_at BETWEEN {{sdate}} AND {{edate}} + INTERVAL 1 DAY AND q.is_enabled = 1 AND q.is_deleted = 0 GROUP BY timing',
			definition: {
				query: 'SELECT creation_date AS timing, COUNT(l.id) as reports_loaded, COUNT(DISTINCT user_id) AS active_users FROM {{logs_db}}.tb_report_logs l JOIN tb_query q USING(query_id) WHERE account_id = {{account_id}} AND l.created_at BETWEEN {{sdate}} AND {{edate}} + INTERVAL 1 DAY AND q.is_enabled = 1 AND q.is_deleted = 0 GROUP BY timing'
			},
			subtitle: 6,
			description: null,
			requested_by: 'Active users of the account',
			tags: null,
			is_redis: '0',
			load_saved: null,
			refresh_rate: 60,
			format: {
				columns:[{
					key: "timing",
					name: "Timing",
					type: {name: "date"},
					disabled: false,
					color: "#a6d6d0",
					searchType :0,
				}]
			},
			editable: false,
			deletable: false,
			added_by_name: '',
			visibilityReason: 'superadmin user',
			filters: [
				{
					filter_id: 1,
					name: 'Start Date',
					query_id: 1,
					placeholder: 'sdate',
					description: null,
					order: 0,
					default_value: '',
					offset: -15,
					multiple: 0,
					type: 'date',
					dataset: null
				},
				{
					filter_id: 2,
					name: 'End Date',
					query_id: 1,
					placeholder: 'edate',
					description: null,
					order: 0,
					default_value: '',
					offset: 0,
					multiple: 0,
					type: 'date',
					dataset: null
				}
			],
			visualizations: [
				{
					visualization_id: 1,
					query_id: 1,
					name: 'Active Users',
					type: 'bar',
					description: '',
					options: '{"axes":[{"label":"Timing","columns":[{"key":"timing"}],"restcolumns":false,"position":"bottom", "format": ""},{"label":"Active Users","columns":[{"key":"active_users"}],"restcolumns":false,"position":"left"}],"hideLegend":false,"showValues":false}',
					added_by: 1,
					editable: true,
					deletable: true,
					visibilityReason: "superadmin user",
					related_visualizations: []
				}
			]
		});
	}
})

exports.internalReports = internalReports;