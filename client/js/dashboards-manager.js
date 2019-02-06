class DashboardManager extends Page {

	constructor() {

		super();

		this.list = new Map;

		this.listContainer = this.container.querySelector('section#list');

		if(user.privileges.has('dashboard.insert')) {
			this.listContainer.querySelector('#add-dashboard').classList.remove('grey');

			this.listContainer.querySelector('#add-dashboard').on('click', () => {
				DashboardsDashboard.add(this);
				history.pushState({id: 'add'}, '', `/dashboards-manager/add`);
			});
		}

		DashboardsDashboard.setup(this);

		(async () => {
			this.setup();
			await this.load();

			this.loadState();
		})();

		window.on('popstate', e => this.loadState(e.state));
	}

	async loadState(state) {

		const what = state ? state.what : location.pathname.split('/').pop();

		if(what == 'add') {
			return DashboardsDashboard.add();
		}

		if(this.list.has(parseInt(what))) {
			return this.list.get(parseInt(what)).edit();
		}

		await Sections.show('list');
	}

	async back() {

		if(history.state) {
			return history.back();
		}

		await Sections.show('list');

		history.pushState(null, '', `/dashboards-manager/`);
	}

	async load() {

		this.response = await API.call('dashboards/list');

		await DataSource.load();

		this.process();
		this.render();
	}

	setup() {

		const filters = [
			{
				key: 'ID',
				rowValue: row => [row.id],
			},
			{
				key: 'Name',
				rowValue: row => row.name ? [row.name] : [],
			},
			{
				key: 'Order',
				rowValue: row => row.order ? [row.order] : [],
			},
			{
				key: 'Created By',
				rowValue: row => row.added_by_name ? [row.added_by_name] : [],
			},
		];

		this.searchBar = new SearchColumnFilters({ filters });

		const heading = this.container.querySelector('.section .heading');

		heading.insertAdjacentHTML('beforeend', `
			<input type="file" accept=".json" class="hidden import-input">
			<button id="import-dashboard">
				<i class="fas fa-code-branch"></i>
				Import Dashboard
			</button>
		`);

		heading.insertAdjacentElement('beforeend', this.searchBar.globalSearch.container);
		heading.insertAdjacentElement('afterend', this.searchBar.container);

		this.searchBar.on('change', () => {
			this.process();
			this.render();
		});

		this.importNewDashboard = new ImportDashboard();

		const
			importInput = heading.querySelector('.import-input'),
			importDashboard = heading.querySelector('#import-dashboard');

		// importInput.on('change', e => {

		// 	if(e.target.files.length) {
		// 		this.upload(e.target.files[0]);
		// 	}
		// });

		// importDashboard.on('click', () => importInput.click());
		importDashboard.on('click', () => {
			this.importNewDashboard.forkDialogBox.body.appendChild(this.importNewDashboard.container);
		});
	}

	// upload(file) {

	// 	if(file.type != 'application/json') {

	// 		return new SnackBar({
	// 			message: 'Please upload JSON file',
	// 			type: 'error',
	// 		});
	// 	}

	// 	const fileReader = new FileReader();

	// 	fileReader.readAsText(file);

	// 	fileReader.onload = async e => {

	// 		if(!e.target.result.trim()) {

	// 			return new SnackBar({
	// 				message: 'Uploaded file is empty',
	// 				type: 'warning',
	// 			});
	// 		}

	// 		this.importNewDashboard.uploadedFile = fileReader.result;

	// 		this.importNewDashboard.createForkedData();

	// 		this.importNewDashboard.forkDialogBox.body.appendChild(this.importNewDashboard.container);

	// 		this.container.querySelector('.section .heading .import-input').value = '';
	// 	}
	// }

	process() {

		this.searchBar.data = this.response;

		this.list.clear();

		for(const dashboard of this.response) {
			this.list.set(dashboard.id, new DashboardsDashboard(dashboard, this.response, this));
		}
	}

	render() {

		const filterData = this.searchBar.filterData;
		this.filter = {};

		const container = this.container.querySelector('.dashboards');
		container.textContent = null;

		for(const data of filterData) {
			this.filter[data.id] = data;
		}

		for(const dashboard of this.list.values()) {

			if(dashboard.visible && !dashboard.parent) {
				container.appendChild(dashboard.container);
			}
		}

		if(!this.list.size || !filterData.length)
			container.innerHTML = `<div class="NA">No dashboards found!</div>`;

		const datalist = [];

		for(const dashboard of this.list.values()) {

			datalist.push({
				value: dashboard.id,
				name: dashboard.name,
				subtitle: dashboard.parents.reverse().map(d => `${d.name} #${d.id}`).join(' &rsaquo; '),
			});
		}

		DashboardsDashboard.parentDashboardMultiselect.datalist = datalist;
		DashboardsDashboard.parentDashboardMultiselect.render();
	}
}

Page.class = DashboardManager;

class DashboardsDashboard {

	static setup(page) {

		DashboardsDashboard.page = page;

		DashboardsDashboard.container = page.container.querySelector('section#form');
		DashboardsDashboard.form = DashboardsDashboard.container.querySelector('form');

		DashboardsDashboard.parentDashboardMultiselect = new MultiSelect({multiple: false});

		DashboardsDashboard.container.querySelector('.parent-dashboard').appendChild(DashboardsDashboard.parentDashboardMultiselect.container);

		DashboardsDashboard.container.querySelector('#back').on('click', page.back);

		DashboardsDashboard.editor = new CodeEditor({mode: 'json'});
		DashboardsDashboard.form.querySelector('label#format').appendChild(DashboardsDashboard.editor.container);
	}

	static async add() {

		const response = await API.call('dashboards/list');

		const datalist = response.map(a => {return {name: a.name, value: a.id}});

		DashboardsDashboard.parentDashboardMultiselect.clear();

		if(DashboardsDashboard.container.querySelector('#form .toolbar .right')) {
			DashboardsDashboard.container.querySelector('#form .toolbar .right').remove();
		}

		DashboardsDashboard.container.querySelector('h1').textContent = 'Add New Dashboard';

		DashboardsDashboard.form.reset();

		DashboardsDashboard.container.querySelector('#share-dashboards').innerHTML = `<div class="NA">You can share the dashboard once you create one.<div>`;

		if(DashboardsDashboard.form_listener) {
			DashboardsDashboard.form.removeEventListener('submit', DashboardsDashboard.form_listener);
		}

		DashboardsDashboard.form.on('submit', DashboardsDashboard.form_listener = e => DashboardsDashboard.insert(e));

		DashboardsDashboard.editor.value = '';

		await Sections.show('form');
		DashboardsDashboard.form.name.focus();
	}

	static async insert(e) {

		e.preventDefault();

		const options = {
			method: 'POST',
			form: new FormData(DashboardsDashboard.form),
		};


		const parameters = {
			format: DashboardsDashboard.editor.value,
			parent: DashboardsDashboard.parentDashboardMultiselect.value[0] || '',
		};

		const response = await API.call('dashboards/insert', parameters, options);

		try {

			await DashboardsDashboard.page.load();

			DashboardsDashboard.page.list.get(response.insertId).edit();

			history.pushState({what: response.insertId}, '', `/dashboards-manager/${response.insertId}`);

			if(await Storage.get('newUser')) {
				UserOnboard.setup(true);
			}

			new SnackBar({
				message: 'Dashboard Added',
				subtitle: `${DashboardsDashboard.form.name.value} #${response.insertId}`,
				icon: 'fas fa-plus',
			});

			await Sections.show('list');

		} catch(e) {

			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message,
				type: 'error',
			});

			throw e;
		}
	}

	constructor(data, dashboards, page) {

		for(const key in data) {
			this[key] = data[key];
		}

		this.page = page;

		this.children = new Map;

		for(const dashboard of dashboards) {

			if(this.page.list.has(dashboard.id) ) {
				continue;
			}

			if(dashboard.parent == this.id) {

				this.page.list.set(dashboard.id, true);

				const childObj = new DashboardsDashboard(dashboard, dashboards, page);

				this.children.set(dashboard.id, childObj);
			}
		}
	}

	async edit() {

		DashboardsDashboard.container.querySelector('h1').textContent = 'Edit ' + this.name;

		if(DashboardsDashboard.container.querySelector('#form .toolbar .right')) {
			DashboardsDashboard.container.querySelector('#form .toolbar .right').remove();
		}

		DashboardsDashboard.container.querySelector('#form .toolbar').insertAdjacentHTML('beforeend', `
			<span class="right NA">
				Added by
				${this.added_by_name ? `<a href="/user/profile/${this.added_by}" target="_blank">${this.added_by_name}</a>` : 'Unknown User'}
				<span title="${Format.dateTime(this.created_at)}">${Format.ago(this.created_at)}</span>
			</span>
		`);

		this.objectRoles = new ObjectRoles('dashboard', this.id);

		await this.objectRoles.load();

		DashboardsDashboard.container.querySelector('#share-dashboards').innerHTML = null;
		DashboardsDashboard.container.querySelector('#share-dashboards').appendChild(this.objectRoles.container);

		DashboardsDashboard.form.reset();

		for(const element of DashboardsDashboard.form.elements) {

			if(this[element.name]) {
				element.value = this[element.name];
			}
		}

		DashboardsDashboard.parentDashboardMultiselect.clear();
		DashboardsDashboard.parentDashboardMultiselect.value = this.parent;

		DashboardsDashboard.editor.value = JSON.stringify(this.format || {}, 0, 4) || '';

		if(DashboardsDashboard.form_listener) {
			DashboardsDashboard.form.removeEventListener('submit', DashboardsDashboard.form_listener);
		}

		DashboardsDashboard.form.on('submit', DashboardsDashboard.form_listener = async e => this.update(e));

		await Sections.show('form');

		DashboardsDashboard.form.name.focus();
	}

	async update(e) {

		e.preventDefault();

		try {
			JSON.parse(DashboardsDashboard.editor.value);
		} catch(e) {
			alert(e.message);
			return;
		}

		const parameters = {
			id: this.id,
			format: DashboardsDashboard.editor.value,
			parent: DashboardsDashboard.parentDashboardMultiselect.value[0] || '',
		};

		const options = {
			method: 'POST',
			form: new FormData(DashboardsDashboard.form),
		};

		try {

			await API.call('dashboards/update', parameters, options);

			await this.page.load();

			this.page.list.get(this.id).edit();

			new SnackBar({
				message: 'Dashboard Saved',
				subtitle: `${this.name} #${this.id}`,
				icon: 'far fa-save',
			});

		} catch(e) {

			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message,
				type: 'error',
			});

			throw e;
		}
	}

	async delete() {

		if(!confirm('Are you sure?!'))
			return;

		const
			parameters = {
				id: this.id,
			},
			options = {
				method: 'POST',
			};

		try {

			await API.call('dashboards/delete', parameters, options);

			await this.page.load();

			if(await Storage.get('newUser')) {
				UserOnboard.setup(true);
			}

			new SnackBar({
				message: 'Dashboard Deleted',
				subtitle: `${this.name} #${this.id}`,
				icon: 'far fa-trash-alt',
			});

		} catch(e) {

			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message,
				type: 'error',
			});

			throw e;
		}
	}

	get container() {


		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');
		container.classList.add('dashboard');

		container.innerHTML = `
			<div class="label">
				<div class="name">
					<a href="/dashboard/${this.id}">${this.name}</a>
					<span class="NA">#${this.id}</span>
				</div>
				<div>${this.order ? ('Order: ' + this.order) : ''}</div>
				<div title="${!this.editable ? 'Not enough privileges' : 'Edit'}" class="action ${!this.editable ? 'grey' : 'green'}"><i class="far fa-edit"></i></div>
				<div title="${!this.deletable ? 'Not enough privileges' : 'Delete'}" class="action ${!this.deletable ? 'grey' : 'red'}"><i class="far fa-trash-alt"></i></div>
			</div>
		`;

		if(container.querySelector('.green')) {
			container.querySelector('.green').on('click', e => {

				e.stopPropagation();

				this.edit();
				history.pushState({what: this.id}, '', `/dashboards-manager/${this.id}`);
			});
		}

		if(container.querySelector('.red')) {
			container.querySelector('.red').on('click', e => {

				e.stopPropagation();

				this.delete()
			});
		}

		if(this.children.size) {

			container.querySelector('.name').insertAdjacentHTML('beforeend', `
				<div class="NA size hidden">(${this.children.size} child dashboard${this.children.size > 1 ? 's': ''})</div>
			`);

			container.insertAdjacentHTML('beforeend', `
				<div class="sub-dashboards"></div>
			`);

			container.querySelector('.label .name').insertAdjacentHTML('afterbegin', `
				<span class="NA arrow">
					<i class="fas fa-angle-down"></i>
				</span>
			`);

			const arrow = container.querySelector('.name .arrow');

			arrow.removeEventListener('click', this.arrowClickListener);

			container.querySelector('.label').on('click', this.arrowClickListener = e => {

				container.querySelector('div.sub-dashboards').classList.toggle('hidden');
				container.querySelector('div.size').classList.toggle('hidden');

				arrow.classList.toggle('right');

			});

			for(const child of this.children.values()) {

				if(child.visible) {
					container.querySelector('div.sub-dashboards').appendChild(child.container);
				}
			}
		}

		return container;
	}

	get visible() {

		if(this.parent && !this.page.list.has(this.parent)) {
			return false;
		}

		if(this.id in this.page.filter) {
			return true;
		}

		for(const child of this.children.values()) {

			if(child.visible) {
				return true;
			}
		}
	}

	get parents() {

		if(this.parentsList) {
			return this.parentsList;
		}

		this.parentsList = [];

		const seen = [];

		let parent = this.parent;

		while(parent) {

			if(!this.page.list.has(parent) || seen.includes(parent)) {
				break;
			}

			const parentDashboard = this.page.list.get(parent);

			this.parentsList.push(parentDashboard);
			seen.push(parentDashboard.id);

			parent = parentDashboard.parent;
		}

		return this.parentsList;
	}
}