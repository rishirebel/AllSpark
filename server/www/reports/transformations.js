const API = require('../../utils/api');
const report = require('./report');

class Transformation extends API {

	async insert({owner_id, owner, title, type, options = null} = {}) {

		this.assert(owner_id && owner, 'Owner id or owner name is missing');
		this.assert(type, 'Type is missing');

		this.assert(await this.checkPrivilege(owner, owner_id), "You don't have enough privileges", 401);

        const values = {owner_id, owner, title, type, options};

        return await this.mysql.query('INSERT INTO demo_master.tb_object_transformation SET  ?', [values], 'write');
	}

	async update({id, owner, title, type, options = null} = {}) {

        this.assert(id && owner, 'Id or owner name is missing');
		this.assert(title && type, 'Title or type is missing');

		const
			values = {id, owner, title, type, options},
			compareJson = {};

		const [updatedRow] =  await this.mysql.query('SELECT * FROM demo_master.tb_object_transformation WHERE id = ? and is_enabled = 1', [id]);

		this.assert(updatedRow, 'Invalid id');

		this.assert(await this.checkPrivilege(owner, updatedRow.owner_id), "You don't have enough privileges", 401);

		for(const key in values) {

			compareJson[key] = updatedRow[key] == null ? null : updatedRow[key].toString();
			updatedRow[key] = values[key];
		}

        if(JSON.stringify(compareJson) == JSON.stringify(values)) {

        	return "0 rows affected";
		}

    	return await this.mysql.query('UPDATE demo_master.tb_object_transformation SET ? WHERE id = ?', [values, id], 'write');
	}

	async delete({id} = {}) {

		this.assert(id, 'Id is required');

		const [updatedRow] =  await this.mysql.query('SELECT * FROM demo_master.tb_object_transformation WHERE id = ? and is_enabled = 1', [id]);

		this.assert(updatedRow, 'Invalid id');

		this.assert(await this.checkPrivilege(updatedRow.owner, updatedRow.owner_id), "You don't have enough privileges", 401);

        return await this.mysql.query('DELETE FROM demo_master.tb_object_transformation WHERE id = ?', [id]);
	}

	async checkPrivilege(owner, owner_id) {

		const
			reports = new report.list(this),
			reportList = await reports.list();

		let is_enabled;

		if(owner == 'visualization') {

			for(const report of reportList){

				report.visualizations.some(element => element.visualization_id == owner_id ? is_enabled = element.is_enabled : '');
			}
		}

		else if(owner == 'query') {

			reportList.some(element => element.query_id == owner_id ? is_enabled = element.is_enabled : '');
		}

		return is_enabled;
	}
}

exports.insert = Transformation;
exports.update = Transformation;
exports.delete = Transformation;