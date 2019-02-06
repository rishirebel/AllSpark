const API = require('../../utils/api');
const reportHistory = require('../../utils/reportLogs');
const auth = require('../../utils/auth');

exports.insert = class extends API {

    async insert({query_id, name, type, description, options = null, tags = null} = {}) {

		this.assert(query_id, 'Query id is required');
		this.assert(name && type, 'Name or type is missing');

	    this.user.privilege.needs("visualization.insert", "ignore");

	    const authResponse = await auth.report(query_id, this.user);

	    this.assert(!authResponse.error, authResponse.message);

        let values = {query_id, name, type, description, options, added_by: this.user.user_id};

        const
            insertResponse = await this.mysql.query('INSERT INTO tb_query_visualizations SET  ?', [values], 'write'),
            [loggedRow] = await this.mysql.query(
                'SELECT * FROM tb_query_visualizations WHERE visualization_id = ?',
                [insertResponse.insertId]
            ),
            logs = {
                owner: 'visualization',
                owner_id: insertResponse.insertId,
                state: JSON.stringify(loggedRow),
                operation:'insert',
            };

        reportHistory.insert(this, logs);

        return insertResponse;
    }
};

exports.update = class extends API {

    async update({visualization_id, name, type, options = null, description = null, tags = null} = {}) {

		this.assert(visualization_id, 'Visualization id is required');
		this.assert(name && type, 'Name or type is missing');

        let
			values = {name, type, options, description, tags},
			[updatedRow] =  await this.mysql.query('SELECT * FROM tb_query_visualizations WHERE visualization_id = ? and is_enabled = 1 and is_deleted = 0', [visualization_id]),
            compareJson = {};

		this.assert(updatedRow, 'Invalid visualization id');

	    const visualizationRolesFromQuery = this.account.settings.has("visualization_roles_from_query") ? this.account.settings.get("visualization_roles_from_query") : !this.account.settings.has("visualization_roles_from_query");

        if(updatedRow.added_by !== this.user.user_id && !visualizationRolesFromQuery) {

            this.user.privilege.needs('visualization.update', 'ignore');
        }

	    const authVisualizationResponse = await auth.visualization(visualization_id, this.user, updatedRow.query_id, visualizationRolesFromQuery);

	    this.assert(!authVisualizationResponse.error, authVisualizationResponse.message);

		for(const key in values) {

			compareJson[key] = updatedRow[key] == null ? null : updatedRow[key].toString();
			updatedRow[key] = values[key];
		}

        if(JSON.stringify(compareJson) == JSON.stringify(values)) {

        	return 'New values are identical to the previous ones.';
		}

        const
            updateResponse = await this.mysql.query('UPDATE tb_query_visualizations SET ? WHERE visualization_id = ?', [values, visualization_id], 'write'),
            logs = {
                owner: 'visualization',
                owner_id: visualization_id,
                state: JSON.stringify(updatedRow),
                operation:'update',
            };

		reportHistory.insert(this, logs);

		return updateResponse
    }
};

exports.delete = class extends API {

    async delete({visualization_id} = {}) {

    	this.assert(visualization_id, 'Visualization Id required');

        const
			[updatedRow] =  await this.mysql.query('SELECT * FROM tb_query_visualizations WHERE visualization_id = ? and is_enabled = 1 and is_deleted = 0', [visualization_id]),
            logs = {
                owner: 'visualization',
                owner_id: visualization_id,
                state: JSON.stringify(updatedRow),
                operation:'delete',
            };

	    const visualizationRolesFromQuery = this.account.settings.has("visualization_roles_from_query") ? this.account.settings.get("visualization_roles_from_query") : !this.account.settings.has("visualization_roles_from_query");

	    const authVisualizationResponse = await auth.visualization(visualization_id, this.user, updatedRow.query_id, visualizationRolesFromQuery);

	    if(updatedRow.added_by !== this.user.user_id && !visualizationRolesFromQuery) {

		    this.user.privilege.needs('visualization.delete', 'ignore');
	    }

	    this.assert(!authVisualizationResponse.error, authVisualizationResponse.message);

	    reportHistory.insert(this, logs);

        return await this.mysql.query('UPDATE tb_query_visualizations SET is_deleted = 1 WHERE visualization_id = ?', [visualization_id], 'write');
    }
};