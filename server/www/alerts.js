const API = require('../utils/api');
const ReportList = require('./reports/report').list;

class Alerts extends API {

	async noRedisDatasets() {

		const
			reportListObj = new ReportList(this),
			response = []
		;

		let
			reportList = await reportListObj.list(),
			reportFilters = reportList.reduce((a, b) => a.concat(b.filters), [])
		;

		reportFilters = new Map(reportFilters.filter(x => x.dataset).map(x => [x.dataset, x]));
		reportList = new Map(reportList.map(x => [x.query_id, x]));

		for(const filter of reportFilters.values()) {

			const query = reportList.get(filter.dataset);

			if(!query || query.is_redis == 'EOD' || parseFloat(query.is_redis)) {

				continue;
			}

			response.push({
				query_id: query.query_id,
				name: `<a href="report/${query.query_id}" target="_blank">${query.name}</a>`
			});
		}

		return response;
	}
}

exports.noRedisDatasets = Alerts;