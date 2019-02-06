class UserProfile extends Page {

	constructor(options) {

		super(options);

		const container = this.container;
		this.id = parseInt(location.pathname.split('/').pop());

		this.load();
	}

	async load() {

		const
			parameters = {
				user_id: this.id || user.id,
			},
			options = {
				method: 'POST',
			};

		await DataSource.load();

		[this.data] = await API.call('users/list', parameters, options);

		this.profileInfo = new ProfileInfo(this);

		this.sessions = new Sessions(this);

		this.render();
	}

	render() {

		const
			info = this.container.querySelector('.heading-bar .info'),
			activity = this.container.querySelector('.heading-bar .activity'),
			access = this.container.querySelector('.heading-bar .access');

		if(!this.data || !this.data.user_id){

			access.remove();
			activity.remove();

			return this.container.querySelector('#profile-info').innerHTML = '<div class="NA">No User found</div>';
		}

		if(!this.data.editable && this.data.user_id != user.user_id) {

			activity.remove();
		}

		this.container.querySelector('h1 span').textContent = [this.data.first_name, this.data.middle_name, this.data.last_name].filter(a => a).join(' ');

		this.container.querySelector('#profile-info').innerHTML = `
			<div class="profile-details">
				<span>User ID</span>
				<div>${this.data.user_id}</div>
				<span>Email</span>
				<div>${this.data.email}</div>
				<span>Phone</span>
				<div>${this.data.phone || '<span class="NA">-</span>'}</div>
				<span>Sign-up Date</span>
				<div>${Format.dateTime(this.data.created_at) || '<span class="NA">-</span>'}</div>
				<span>Added By</span>
				<div>${this.data.added_by_user || '<span class="NA">-</span>'}</div>
			</div>
		`;

		this.profileInfo.render();

		info.on('click',() => {

			this.container.querySelector('.heading-bar .selected').classList.remove('selected');
			info.classList.add('selected');

			Sections.show('profile-info');
		});

		access.on('click',() => {

			this.container.querySelector('.heading-bar .selected').classList.remove('selected');
			access.classList.add('selected');

			Sections.show('access');
		});

		activity.on('click', async () => {

			this.container.querySelector('.heading-bar .selected').classList.remove('selected');

			activity.classList.add('selected');

			if(!this.container.querySelector('.activity-info .sessions')) {
				const response = await this.sessions.load();
				await this.sessions.process(response);
			}

			this.container.querySelector('.activity-info').appendChild(this.sessions.container);

			Sections.show('activity');
		});
	}
}

Page.class = UserProfile;

class Sessions {

	constructor(user) {

		Object.assign(this, user.data);

		this.sessionsList = new Map;
	}

	async load() {

		if(this.response)
			return this.response;

		const
			parameters = {
				user_id: this.user_id,
			},
			options = {
				method: 'GET',
			};

		this.response = await API.call('session-logs/list', parameters, options);

		return this.response;
	}

	async process(sessions) {

		this.sessionsList.clear();

		for(const session of sessions) {
			this.sessionsList.set(session.id, new Session(session));
		}
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');
		container.classList.add('sessions');

		container.innerHTML = `

			<div class="toolbar hidden">
				<h3>Show session details</h3>
			</div>

			<div class="list"></div>
		`;

		const list = container.querySelector('.list');
		list.textContent = null;

		for(const session of this.sessionsList.values())
			list.appendChild(session.container);

		if(!this.sessionsList.size) {

			list.innerHTML = '<div class="NA">No activity found.</div>'
		}

		return container;
	}
}

class Session {

	constructor(session) {

		Object.assign(this, session);

		this.activityGroups = new ActivityGroups([]);
	}

	async load() {

		const
			parameters = new URLSearchParams(),
			options = {
				method: 'GET',
			};

		parameters.set('user_id', this.user_id);
		parameters.set('session_id', this.id);

		['query', 'visualization'].map(x => parameters.append('owner', x));

		const [reportsLoaded, errors, reportsHistory] = await Promise.all([
			API.call('reports/logs/log', parameters.toString(), options),
			API.call('errors/list', parameters.toString(), options),
			API.call('reports/logs/history', parameters.toString(), options)
		]);

		this.process(reportsLoaded, errors, reportsHistory);
	}

	process(reports, errors, reportsHistory) {

		for(const report of reports)
			report.type = 'report';

		for(const error of errors)
			error.type = 'error';

		const activity = [...reports, ...errors];

		this.reportsManaged = 0;
		this.visualizationsManaged = 0;

		for(const row of reportsHistory) {

			row.owner == 'query' ? this.reportsManaged++ : this.visualizationsManaged++;

			row.type = `${row.operation.concat(row.owner, 'log')}`;
			activity.push(row);
		}

		this.reportsCount = reports.length;
		this.errorsCount = errors.length;

		const groupedActivity = this.groupedActivity(activity);

		this.activityGroups = new ActivityGroups(groupedActivity);
	}

	groupedActivity(activity) {

		activity = activity.sort((a, b) => {
			if(a.created_at < b.created_at)
				return -1;
			else
				return 1;
		});

		const groupedList = [];

		let tempList = [];

		for(const data of activity) {

			if(!activity.indexOf(data)) {
				tempList.push(data);
			}
			else if(tempList[tempList.length - 1].type == activity[activity.indexOf(data)].type) {
				tempList.push(data);
			}
			else {
				groupedList.push(tempList);
				tempList = [];
				tempList.push(data);
			}

			if(activity.indexOf(data) == activity.length - 1){
				groupedList.push(tempList);
			}
		}

		return groupedList;
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('article');
		container.classList.add('active');

		let detailString = [this.browser, this.OS, this.ip].filter(d => d);

		detailString = detailString.join('&middot;&nbsp;');

		container.innerHTML = `
			<div class="info-grid">
				<div class="icon"><i class="far fa-clock"></i></div>

				<div class="title">
					<span class="NA">#${this.id}</span>
					${Format.dateTime(this.created_at)}
				</div>
				<span class="down"><i class="fas fa-angle-right"></i></span>

				<div class="extra-info NA">${detailString}</div>

				<span class="activity-details NA"></span>
			</div>

			<div class="loading-activity-groups hidden">
				<i class="fa fa-spinner fa-spin"></i>
			</div>
		`;

		container.querySelector('.info-grid').on('click', async() => {

			container.querySelector('.down i').classList.toggle('angle-rotate');

			if(this.activityGroups.size)
				return container.querySelector('.activity-groups').classList.toggle('hidden');

			container.querySelector('.loading-activity-groups').classList.remove('hidden');

			await this.load();

			container.querySelector('.activity-details').innerHTML = `
				Reports loaded: ${Format.number(this.reportsCount)} &middot; Errors: ${Format.number(this.errorsCount)} &middot;
				Reports: ${this.reportsManaged} &middot; Visualizations: ${this.visualizationsManaged}
			`;

			container.appendChild(this.activityGroups.container);

			container.querySelector('.loading-activity-groups').remove();

		});

		return container;
	}
}

class ActivityGroups extends Set {

	constructor(activityGroups) {

		super();

		for(const activityGroup of activityGroups) {
			this.add(new ActivityGroup(activityGroup))
		}
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');
		container.classList.add('activity-groups');

		for(const activityGroup of this)
			container.appendChild(activityGroup.container);

		return container;
	}
}

class ActivityGroup extends Set {

	constructor(activityGroup) {

		super();

		this.type = activityGroup[0].type;
		this.operation = activityGroup[0].operation;

		for(const activity of activityGroup) {

			if(activity.type == 'report') {

				this.add(new ActivityReport(activity));
			}
			else if(activity.type.includes('visualizationlog') || activity.type.includes('querylog')) {

				this.add(new ActivityHistory(activity));
			}
			else if(activity.type == 'error') {

				this.add(new ActivityError(activity));
			}
		}
	}

	get titleInfo() {

		let icon, name;

		if(this.type == 'report') {

			icon = 'far fa-file';
			name = `Report${this.size == 1 ? '' : 's'} loaded`;
		}
		else if(this.type.includes('visualizationlog')) {

			icon = 'fas fa-chart-line';
			name = `Visualization${this.size == 1 ? '' : 's'} ${this.operation == 'insert' ? 'inserted' : (this.operation + 'd')}`;

		}
		else if(this.type.includes('querylog')) {

			icon = 'fas fa-history';
			name = `Report${this.size == 1 ? '' : 's'} ${this.operation == 'insert' ? 'inserted' : (this.operation + 'd')}`;
		}
		else {
			icon = 'fas fa-exclamation';
			name = `Error${this.size == 1 ? '' : 's'}`
		}

		return {icon, name};
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');

		container.classList.add('activity-group');

		container.innerHTML = `
			<div class="info-grid">
				<div class="icon"><i class="${this.titleInfo.icon}"></i></div>
				<div class="title">
					<span class="NA">${Format.number(this.size)}</span>
					<span class="type">${this.titleInfo.name}</span>
				</div>
				<div class="down">
					<i class="fas fa-angle-right"></i>
				</div>

				<div class="extra-info">
					${Format.dateTime(Array.from(this)[0].created_at)} - ${Format.dateTime(Array.from(this)[this.size - 1].created_at)}
				</div>
			</div>

			<div class="activity-list hidden"></div>
		`;

		const activityList = container.querySelector('.activity-list');

		container.querySelector('.info-grid').on('click', () => {

			activityList.classList.toggle('hidden');

			container.querySelector('.info-grid').classList.toggle('selected');
			container.querySelector('.down').classList.toggle('angle-rotate');

			if(activityList.childElementCount)
				return;

			const tempContainer = document.createDocumentFragment();

			for(const activity of this)
				tempContainer.appendChild(activity.container);

			activityList.appendChild(tempContainer);
		});

		return container;
	}
}

class Activity {

	constructor(data) {

		Object.assign(this, data);
	}

	get createdAt() {

		if(this.createdAtElement)
			return this.createdAtElement;

		const container = this.createdAtElement = document.createElement('span');
		container.classList.add('NA');

		container.textContent = Format.dateTime(this.created_at);

		return container;
	}

	get container() {

		if(this.activityContainerElement)
			return this.activityContainerElement;

		const container = this.activityContainerElement = document.createElement('div');

		container.classList.add('info-grid');

		container.on('click', () => {

			if(this.dialogBox) {

				this.dialogBox.show();
				return;
			}

			this.dialogBox = new DialogBox();

			this.dialogBox.heading = this.heading;
			this.dialogBox.container.classList.add('logs');

			this.dialogBox.body.classList.add('activity-popup');

			for(const key of this.keys) {

				const span = document.createElement('span');
				span.classList.add('key');
				span.textContent = key + ':';

				this.dialogBox.body.appendChild(span);

				try {
					const value = typeof this[key] == 'object' ? this[key] : JSON.parse(this[key]);

					if(typeof value == 'object') {

						const pre = document.createElement('pre');
						pre.classList.add('value', 'json');
						pre.textContent = JSON.stringify(value, 0, 4);

						this.dialogBox.body.appendChild(pre);
					}
					else {

						const span = document.createElement('span');
						span.classList.add('value');
						span.textContent = this[key];

						this.dialogBox.body.appendChild(span);
					}
				}
				catch(e) {

					const pre = document.createElement('pre');

					pre.classList.add('value', 'sql');
					pre.textContent = new FormatSQL(this[key]).query;

					this.dialogBox.body.appendChild(pre);
				}
			}

			this.dialogBox.show();
		});

		container.appendChild(this.name);
		container.appendChild(this.extraInfo);
		container.appendChild(this.createdAt);

		return container;
	}
}

class ActivityReport extends Activity {

	constructor(report) {

		super(report);

		Object.assign(this, report)
	}

	get name() {

		if(this.nameElement)
			return this.nameElement;

		const title = this.nameElement = document.createElement('div');
		title.classList.add('title');

		title.textContent = DataSource.list.get(this.query_id).name;

		const span = document.createElement('span');
		span.classList.add('NA');
		span.textContent = '#' + this.id;

		title.appendChild(span);

		return title;
	}

	get heading() {

		if(this.headingElement)
			return this.headingElement;

		const span = this.headingElement = document.createElement('span');

		span.textContent =  DataSource.list.get(this.query_id).name;

		return span;
	}

	get keys() {

		return ['user_id','session_id', 'query_id', 'response_time', 'rows', 'result_query'];
	}

	get extraInfo() {

		if(this.extraInfoElement)
			return this.extraInfoElement;

		const extraInfo = this.extraInfoElement = document.createElement('div');
		extraInfo.classList.add('extra-info');

		extraInfo.textContent = `Execution Time: ${this.response_time}`;

		return extraInfo;
	}
}

class ActivityError extends Activity {

	constructor(error) {

		super(error);

		Object.assign(this, error)
	}

	get keys() {

		return ['user_id', 'session_id', 'status', 'message', 'description'];
	}

	get name() {

		if(this.titleElement)
			return this.titleElement;

		const title = this.containerElement = document.createElement('div');
		title.classList.add('title');

		title.textContent = 'Error';

		return title;
	}

	get heading() {

		if(this.headingElement)
			return this.headingElement;

		const span = this.headingElement = document.createElement('span');

		span.textContent = 'Error';

		return span;
	}

	get extraInfo() {

		if(this.extraInfoElement)
			return this.extraInfoElement;

		const extraInfo = this.containerElement = document.createElement('div');
		extraInfo.classList.add('extra-info');

		extraInfo.textContent = 'Type:' + this.type;

		return extraInfo;
	}
}

class ActivityHistory extends Activity {

	constructor(row) {

		super(row);

		try {

			this.state = JSON.parse(this.state);
		}
		catch(e) {

			this.state = {};
		}
	}

	get name() {

		if(this.nameElement)
			return this.nameElement;

		const title = this.nameElement = document.createElement('div');
		title.classList.add('title');

		title.textContent = this.state.name;

		const span = document.createElement('span');
		span.classList.add('NA');
		span.textContent = '#' + this.owner_id;

		title.appendChild(span);

		return title;
	}

	get heading() {

		if(this.headingElement)
			return this.headingElement;

		const span = this.headingElement = document.createElement('span');

		span.textContent = 'Report History';

		return span;
	}

	get extraInfo() {

		if(this.extraInfoElement)
			return this.extraInfoElement;

		const extraInfo = this.extraInfoElement = document.createElement('div');
		extraInfo.classList.add('extra-info');

		extraInfo.textContent = `Operation: ${this.operation}`;

		return extraInfo;
	}

	get keys() {

		return ['user_id', 'session_id', 'owner_id', 'state', 'operation'];
	}
}

class ProfileInfo {

	constructor(page) {

		Object.assign(this, page);

		this.sortPrivilegesTable = new SortTable({
			table: this.container.querySelector('table.privileges'),
		});

		this.sortRolesTable = new SortTable({
			table: this.container.querySelector('table.roles'),
		});

		this.sortSubPrivilegesTable = new SortTable();

		this.cachedPrivileges = new Map();
	}

	render() {

		const privileges = this.container.querySelector('.privileges tbody');

		privileges.textContent = null;

		for(const privilege of this.data.privileges || []) {

			const
				row = document.createElement('tr'),
				privilegeName = MetaData.privileges.has(privilege.privilege_id) ? MetaData.privileges.get(privilege.privilege_id).name : '';

			row.innerHTML =  `
				<td>${MetaData.categories.has(privilege.category_id) ? MetaData.categories.get(privilege.category_id).name : ''}</td>
				<td class="privilege-name">${privilegeName}</td>
			`;

			row.querySelector('.privilege-name').on('click', async() => {

				const response = await this.fetch(privilege.privilege_id);

				this.showDialogBox(privilegeName, response);
			});

			privileges.insertAdjacentElement('beforeend', row);
		}

		if(!this.data.privileges || !this.data.privileges.length) {
			privileges.innerHTML = `<tr class="NA"><td colspan="2">No Privileges assigned!</td></tr>`;
		}

		this.sortPrivilegesTable.sort();

		const roles = this.container.querySelector('.roles tbody');

		roles.textContent = null;

		for(const role of this.data.roles || []) {
			roles.insertAdjacentHTML('beforeend', `
				<tr>
					<td>${MetaData.categories.has(role.category_id) ? MetaData.categories.get(role.category_id).name : ''}</td>
					<td>${MetaData.roles.has(role.role_id) ? MetaData.roles.get(role.role_id).name : ''}</td>
				</tr>
			`);
		}

		if(!this.data.roles || !this.data.roles.length) {
			roles.innerHTML = `<tr class="NA"><td colspan="2">No Roles assigned!</td></tr>`;
		}

		this.sortRolesTable.sort();
	}

	async fetch(privilege_id) {

		if(this.cachedPrivileges.has(privilege_id)) {

			return this.cachedPrivileges.get(privilege_id);
		}

		const
			options = {
				method: 'POST',
			},
			parameter = {
				id: privilege_id,
			};

		const response = await API.call('privileges_manager/list', parameter, options);

		this.cachedPrivileges.set(privilege_id, response);

		return response;
	}

	showDialogBox(name, privileges) {

		const dialogBox = new DialogBox();

		dialogBox.heading = name + ' Sub Privileges List';

		dialogBox.body.classList.add('privilege-list-popup');

		if(!privileges || !privileges.length) {

			const element = document.createElement('span');

			element.classList.add('privilege-list-empty')

			element.innerHTML = 'No sub privileges exist';

			dialogBox.body.appendChild(element);

			dialogBox.show();

			return;
		}

		const table = document.createElement('table');

		table.innerHTML = `
			<thead>
				<tr>
					<th>Privilege ID</th>
					<th>Privilege Name</th>
				</tr>
			</thead>
			<tbody></tbody>
		`;

		const tbody = table.querySelector('tbody');

		for(const privilege of privileges || []) {

			const row = document.createElement('tr');

			row.innerHTML =  `
				<td>${privilege.privilege_id || ''}</td>
				<td class="privilege">${privilege.name || ''}</td>
			`;

			tbody.appendChild(row);
		}

		this.sortSubPrivilegesTable.table = table;
		this.sortSubPrivilegesTable.sort();

		dialogBox.body.appendChild(table);

		dialogBox.show();
	}
}