const API = require('../../utils/api');
const report = require('./report');

class Transformation extends API {

	async insert({owner_id, owner, title, type, options = '{}'} = {}) {

		this.assert(owner_id && owner, 'Owner id or owner name is missing');
		this.assert(type, 'Type is missing');

		this.assert(await this.checkPrivilege(owner, owner_id), "You don't have enough privileges", 401);

        const values = {owner_id, owner, title, type, options};

        return await this.mysql.query('INSERT INTO tb_object_transformation SET  ?', [values], 'write');
	}

	async update({id, owner, title, type, options = '{}'} = {}) {

        this.assert(id, 'Id is required');

		const
			values = {id, owner, title, type, options},
			compareJson = {};

		const [updatedRow] =  await this.mysql.query('SELECT * FROM tb_object_transformation WHERE id = ? and is_enabled = 1', [id]);

		this.assert(updatedRow, 'Invalid id');

		this.assert(await this.checkPrivilege(updatedRow.owner, updatedRow.owner_id), "You don't have enough privileges", 401);

		for(const key in values) {

			compareJson[key] = updatedRow[key] ? updatedRow[key].toString() : null;
		}

		try {

			compareJson.options = JSON.parse(compareJson.options);
			values.options = JSON.parse(values.options);
		}
		catch(e){}

        if(JSON.stringify(compareJson) == JSON.stringify(values)) {

        	return 'Unchanged';
		}

		values.options = JSON.stringify(values.options);

    	return await this.mysql.query('UPDATE tb_object_transformation SET ? WHERE id = ?', [values, id], 'write');
	}

	async delete({id} = {}) {

		this.assert(id, 'Id is required');

		const [updatedRow] =  await this.mysql.query('SELECT * FROM tb_object_transformation WHERE id = ? and is_enabled = 1', [id]);

		this.assert(updatedRow, 'Invalid id');

		this.assert(await this.checkPrivilege(updatedRow.owner, updatedRow.owner_id), "You don't have enough privileges", 401);

        return await this.mysql.query('DELETE FROM tb_object_transformation WHERE id = ?', [id], 'write');
	}

	async checkPrivilege(owner, owner_id) {

		const
			reports = new report.list(this),
			reportList = await reports.list();

		if(owner == 'visualization') {

			for(const report of reportList) {

				for(const visualization of report.visualizations) {

					console.log(visualization.visualization_id, '===', owner_id ,'=====', visualization.is_enabled, '----', visualization.editable,'---valuess');

					console.log((visualization.visualization_id == owner_id) && (visualization.is_enabled && visualization.editable),'---check true or false')
					return (visualization.visualization_id == owner_id) && (visualization.is_enabled && visualization.editable);
				}
			}
		}

		else if(owner == 'query') {

			for(const report of reportList) {

				return (report.query_id == owner_id) && (report.is_enabled && report.editable);
			}
		}
	}
}

exports.insert = Transformation;
exports.update = Transformation;
exports.delete = Transformation;