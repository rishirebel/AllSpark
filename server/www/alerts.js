const API = require('../utils/api');

exports.noRedisDatasets = class extends API {

	async noRedisDatasets() {

		this.user.privilege.needs('report');

		return this.mysql.query(
			`SELECT
				f.dataset, q.name AS dataset_name
			FROM
				tb_query_filters f
			JOIN
				tb_query q
			ON
				q.query_id = f.dataset
			WHERE
				f.dataset IS NOT NULL
				AND q.is_deleted = 0
				AND q.is_enabled = 1
				AND (
					q.is_redis IS NULL
					OR (
						q.is_redis NOT LIKE '%EOD%'
						AND (q.is_redis = 0 OR q.is_redis = '')
					)
				)
			GROUP BY
				dataset	
			`
		);
	}
}