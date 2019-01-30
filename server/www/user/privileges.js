const API = require('../../utils/api');
const getRole = require("../object_roles").get;
const constants = require("../../utils/constants");

exports.list = class extends API {
    async list() {
        this.user.privilege.needs('user');
        return await this.mysql.query(
            'SELECT * FROM tb_user_privilege WHERE user_id IN (SELECT user_id FROM tb_users WHERE account_id = ?)',
            [this.account.account_id]
        );
    }
}

exports.insert = class extends API {
    async insert() {

        this.user.privilege.needs('user', 'ignore');

        if (!('user_id' in this.request.body) || !('category_id' in this.request.body) || !('privilege_id' in this.request.body))
            return false;

        const user_id = this.request.body.user_id;
        const category_id = this.request.body.category_id;
        const privilege_id = this.request.body.privilege_id;
        const account_id = this.account.account_id;

        const query = `
            insert into tb_user_privilege(user_id,category_id,privilege_id)		
                select ?, ?, ? 
                    where
                        'true' in( 
                            select 
                                    case 
                                        when 
                                            'true' in (select 'true' from tb_users where user_id = ? and account_id = ?)
                                            and
                                            'true' in (select 'true' from tb_categories where category_id = ? and account_id = ?)
                                            and
                                            'true' in (select 'true' from tb_privileges where privilege_id = ?)
                                        then 'true'
                                    end
                        )
        `;

        return await this.mysql.query(
            query,
            [user_id, category_id, privilege_id, user_id, account_id, category_id, account_id, privilege_id, account_id],
            'write'
        );
    }
}

exports.update = class extends API {

    async update() {
        // this.user.privilege.needs('user');
	    const user_id = this.request.body.user_id;

        this.assert(user_id, "user id not found");

	    const objRole = new getRole();
	    const requiredRoles = await objRole.get(this.account.account_id, "query", "role", user_id);

	    let flag = false;

	    for(const row of requiredRoles) {

	        for (const cat of row.category_id) {

		        flag = flag || this.user.privilege.has('user.update', cat);
	        }
        }

        flag = flag || !flag.length;

        this.assert(flag, "user does not have enough privileges");

        const id = this.request.body.id;
        const category_id = this.request.body.category_id;
        const privilege_id = this.request.body.privilege_id;
        const account_id = this.account.account_id;

        const query = `
            update tb_user_privilege set user_id = ?, category_id = ?, privilege_id = ?
            where 
                id = ?
                and 'true' in 
                    (select 
                        case 
                            when 
                                'true' in (select 'true' from tb_users where user_id = ? and account_id = ?)
                                and
                                'true' in (select 'true' from tb_categories where category_id = ? and account_id = ?)
                                and
                                'true' in (select 'true' from tb_privileges where privilege_id = ?)
                            then 'true'
                        end)
        `;

        return await this.mysql.query(
            query,
            [user_id, category_id, privilege_id, id, user_id, account_id, category_id, account_id, privilege_id],
            'write'
        );
    }
}

exports.delete = class extends API {
    async delete() {

	    const userId = this.request.body.id;

	    this.assert(userId, "user id not found");

	    const objRole = new getRole();

	    const requiredRoles = await objRole.get(this.account.account_id, "query", "role", userId);

	    let flag = false;

	    for(const row of requiredRoles) {

		    for (const cat of row.category_id) {

			    flag = flag || this.user.privilege.has('user.delete', cat);
		    }
	    }

	    flag = flag || !flag.length;

	    this.assert(flag, "user does not have enough privileges");

        return await this.mysql.query(
            'DELETE FROM tb_user_privilege WHERE id = ? AND user_id IN (SELECT user_id FROM tb_users WHERE account_id = ?)',
            [this.request.body.id, this.account.account_id],
            'write'
        );
    }
}