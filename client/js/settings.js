class Settings extends Page {

	constructor() {

		(async() => {

			super();

			const nav = this.container.querySelector('nav');

			for (const [key, settings] of Settings.list) {

				if(['executingReports', 'accounts', 'cachedReports', 'alerts'].includes(key) && !this.user.privileges.has('superadmin')) {
					continue;
				}

				if(key == 'categories' && !user.privileges.has('category.insert') && !user.privileges.has('category.update') && !user.privileges.has('category.delete')) {
					continue;
				}

				if(key != 'categories' && !user.privileges.has('administrator')) {
					continue;
				}

				const setting = new settings(this.container);

				const a = document.createElement('a');

				a.textContent = setting.name;

				a.on('click', async () => {

					await Storage.set('settingsCurrentTab', setting.name);
					clearInterval(Settings.autoRefreshInterval);

					for (const a of nav.querySelectorAll('a.selected')) {
						a.classList.remove('selected');
					}

					for (const a of this.container.querySelectorAll('.setting-page')) {
						a.classList.add('hidden');
					}

					a.classList.add('selected');

					await setting.setup();

					setting.load();
					setting.container.classList.remove('hidden');
				});

				nav.appendChild(a);
			}

			await this.loadDefault();
		})();
	}

	async loadDefault() {

		clearInterval(Settings.autoRefreshInterval);

		let byDefault;

		if(await Storage.has('settingsCurrentTab')) {

			const tab = await Storage.get('settingsCurrentTab');

			for(const a of this.container.querySelectorAll('nav a')) {

				if(a.textContent == tab) {
					byDefault = a;
				}
			}
		}
		else {
			byDefault = this.container.querySelector('nav a');
		}

		if(byDefault) {
			byDefault.classList.add('selected');
		}

		for (const [key, settings] of Settings.list) {

			const setting = new settings(this.container);

			if (byDefault && byDefault.textContent == setting.name) {

				await setting.setup();

				setting.load();
				setting.container.classList.remove('hidden');
			}
		}
	}
}

Page.class = Settings;

class SettingPage {

	constructor(page) {
		this.page = page;
	}
}

Settings.list = new Map;

Settings.list.set('accounts', class Accounts extends SettingPage {

	get name() {
		return 'Accounts';
	}

	setup() {

		this.container = this.page.querySelector('.accounts-page');
		this.form = this.container.querySelector('#accounts-form');

		this.container.querySelector('#accounts-list #add-account').on('click', () => SettingsAccount.add(this));
		this.container.querySelector('#accounts-form #cancel-form').on('click', () => Sections.show('accounts-list'));

		this.sortTable = new SortTable({
			table: this.container.querySelector('#accounts-list table'),
		});
	}

	async load() {

		const list = await API.call('accounts/list');

		this.list = new Map;

		for(const account of list) {
			this.list.set(account.account_id, new SettingsAccount(account, this));
		}

		await this.render();
	}

	async render() {

		const container = this.container.querySelector('#accounts-list table tbody');

		container.textContent = null;

		if(!this.list.size) {
			container.innerHTML = '<tr><td class="NA" colspan="5">No Accounts Found</td></tr>';
		}

		for(const account of this.list.values()) {
			container.appendChild(account.row);
		}

		this.sortTable.sort();

		await Sections.show('accounts-list');
	}
});

Settings.list.set('globalFilters', class GlobalFilters extends SettingPage {

	get name() {
		return 'Global Filters';
	}

	async setup() {

		this.container = this.page.querySelector('.global-filters-page');
		this.form = this.container.querySelector('section#global-filters-form form');

		this.container.querySelector('#global-filters-list #add-global-filter').on('click', () => GlobalFilter.add(this));
		this.container.querySelector('#global-filters-form #cancel-form').on('click', () => Sections.show('global-filters-list'));

		await DataSource.load();

		const datalist = [];

		for(const report of DataSource.list.values()) {

			datalist.push({
				name: report.name,
				value: report.query_id,
				subtitle: `#${report.query_id}`
			});
		}

		this.datasetsMultiselect =  new MultiSelect({datalist, dropDownPosition: 'top', multiple: false});

		if(this.form.querySelector('.datasets .multi-select')) {
			this.form.querySelector('.datasets .multi-select').remove();
		}

		this.form.querySelector('.datasets').appendChild(this.datasetsMultiselect.container);

		const select = this.form.querySelector('select[name="type"]');

		select.textContent = null;

		for(const type of MetaData.filterTypes.values()) {
			select.insertAdjacentHTML('beforeend', `<option value="${type.name.toLowerCase()}">${type.name}</option>`);
		}

		this.sortTable = new SortTable({
			table: this.container.querySelector('#global-filters-list table'),
		});
	}

	async load() {

		const response = await API.call('global-filters/list');

		this.list = new Map;

		for (const data of response) {
			this.list.set(data.id, new GlobalFilter(data, this));
		}

		if(!this.dashboardList) {
			this.dashboardList = await API.call('dashboards/list');
		}

		await this.render();
	}

	async render() {

		const container = this.container.querySelector('#global-filters-list table tbody');

		container.textContent = null;

		if(!this.list.size) {
			container.innerHTML = '<tr><td colspan="12" class="NA">No Global Filters Found</td></tr>'
		}

		for(const globalFilter of this.list.values()) {
			container.appendChild(globalFilter.row);
		}

		this.sortTable.sort();

		await Sections.show('global-filters-list');
	}
});

Settings.list.set('privileges', class Privileges extends SettingPage {

	get name() {
		return 'Privileges';
	}

	setup() {

		this.container = this.page.querySelector('.privilege-page');
		this.form = this.container.querySelector('section#privileges-form form');

		this.container.querySelector('#privileges-list #add-privilege').on('click', () => SettingsPrivilege.add(this));
		this.container.querySelector('#privileges-form #cancel-form').on('click', () => Sections.show('privileges-list'));

		this.sortTable = new SortTable({
			table: this.container.querySelector('#privileges-list table'),
		});
	}

	async load() {

		Privileges.response = await API.call('privileges/list');

		this.list = new Map;

		for(const data of Privileges.response) {
			this.list.set(data.privilege_id, new SettingsPrivilege(data, this));
		}

		await this.render();
	}

	async render() {

		const container = this.container.querySelector('#privileges-list table tbody');

		container.textContent = null;

		if(!this.list.size) {
			container.innerHTML = '<tr><td class="NA" colspan="5">No Privileges Found</td></tr>';
		}

		for(const dataset of this.list.values()) {
			container.appendChild(dataset.row);
		}

		this.sortTable.sort();

		await Sections.show('privileges-list');
	}
});

Settings.list.set('roles', class Roles extends SettingPage {

	get name() {
		return 'Roles';
	}

	setup() {

		this.container = this.page.querySelector('.roles-page');
		this.form = this.page.querySelector('#role-form');

		this.container.querySelector('#roles-list #add-role').on('click', () => SettingsRole.add(this));
		this.container.querySelector('#roles-form #back').on('click', () => Sections.show('roles-list'));

		this.sortTable = new SortTable({
			table: this.container.querySelector('#roles-list table'),
		});
	}

	async load() {

		const roles_list = await API.call('roles/list');

		this.list = new Map();

		for(const role of roles_list) {
			this.list.set(role.role_id, new SettingsRole(role, this));
		}

		await this.render();
	}

	async render() {

		const container = this.container.querySelector('#roles-list table tbody');

		container.textContent = null;

		if(!this.list.size) {
			container.innerHTML = '<tr><td class="NA" colspan="5">No Roles Found</td></tr>';
		}

		for(const role of this.list.values()) {
			container.appendChild(role.row);
		}

		this.sortTable.sort();

		await Sections.show('roles-list');
	}
});

Settings.list.set('categories', class Categories extends SettingPage {

	get name() {
		return 'Categories';
	}

	setup() {

		this.container = this.page.querySelector('.category-page');
		this.form = this.page.querySelector('#category-edit');

		if(user.privileges.has('category.insert')) {
			this.container.querySelector('#category-list #add-category').on('click', () => SettingsCategory.add(this));
		} else {
			this.container.querySelector('#category-list #add-category').disabled = true;
		}

		this.sortTable = new SortTable({
			table: this.container.querySelector('#category-list table'),
		});

		this.container.querySelector('#category-edit #back').on('click', () => Sections.show('category-list'));
	}

	async load() {

		const categoryList = await API.call('category/list');

		this.list = new Map();

		for(const category of categoryList) {
			this.list.set(category.category_id, new SettingsCategory(category, this));
		}

		await this.render();
	}

	async render() {

		const container = this.container.querySelector('#category-list table tbody');

		container.textContent = null;

		if(!this.list.size) {
			container.innerHTML = '<tr><td class="NA" colspan="5">No Categories Found</td></tr>';
		}

		for(const category of this.list.values()) {
			container.appendChild(category.row);
		}

		this.sortTable.sort();

		await Sections.show('category-list');
	}
});

Settings.list.set('documentation', class Documentations extends SettingPage {

	constructor(...params) {

		super(...params);

		this.list = new Map;
	}

	get name() {
		return 'Documentation';
	}

	async setup() {

		this.container = this.page.querySelector('.documentation-page');

		this.list.clear();

		this.sortTable = new SortTable({
			table: this.section.querySelector('table'),
		});

		if(this.container.querySelector('#documentation-list')) {
			this.container.querySelector('#documentation-list').remove();
		}

		this.container.textContent = null;

		if(this.addFormElement) {
			this.addFormElement = null;
		}

		this.container.appendChild(this.addForm);
	}

	async load(force) {

		const response = await API.call('documentation/list');

		this.list.clear();

		for (const data of response) {
			this.list.set(data.id, new DocumentationEdit(data, this));
		}

		this.parentDatalist = response.map(d => {return {name: d.heading, value: d.id, subtitle: d.slug}});

		if(force) {
			for(const node of this.container.querySelectorAll('.edit-form')) {
				node.remove();
			}
		}

		await this.render();
	}

	async render() {

		this.container.appendChild(this.section);

		const container = this.section.querySelector('table tbody');

		container.textContent = null;

		if(!this.list.size) {
			container.innerHTML = '<tr><td colspan="7" class="NA">No Documentation Found</td></tr>';
		}

		for(const documentation of this.list.values()) {
			container.appendChild(documentation.row);
		}

		for(const documentation of this.list.values()) {
			this.container.appendChild(documentation.form);
		}

		this.sortTable.sort();

		await Sections.show('documentation-list');
	}

	get addForm() {

		if(this.addFormElement) {
			return this.addFormElement;
		}

		const container = this.addFormElement = document.createElement('section');
		container.classList.add('section');
		container.id = 'documentation-form-add';

		container.innerHTML = `

			<h1>Add new Documentation</h1>

			<header class="toolbar">
				<button id="cancel-form"><i class="fa fa-arrow-left"></i> Back</button>
				<button type="submit" form="documentation-add"><i class="far fa-save"></i> Save</button>
			</header>

			<form class="block form" id="documentation-add">
				<label>
					<span>Heading <span class="red">*</span></span>
					<input type="text" name="heading" required>
				</label>

				<label>
					<span>Slug <span class="red">*</span><a data-tooltip="Auto generate the slug from heading." class="generate-slug">Generate</a></span>
					<input type="text" name="slug" required>
				</label>

				<label class="parent">
					<span>Parent</span>
				</label>

				<label>
					<span>Chapter <span class="red">*</span></span>
					<input type="number" name="chapter" min="1" step="1" required>
				</label>

				<div class="body">
					<span>Body</span>
					<span class="preview-label">Preview</span>
					<div class="preview documentation"></div>
				</div>
			</form>
		`;

		const form = this.form = container.querySelector('form');

		container.querySelector('#cancel-form').on('click', () => {
			Sections.show('documentation-list');
		});

		container.querySelector('.generate-slug').on('click', () => {

			const
				heading = form.heading.value,
				slug = heading.toLowerCase().split(' ').join('_');

			form.slug.value = slug;
		});

		this.parentMultiSelect = new MultiSelect({multiple: false});

		form.querySelector('.parent').appendChild(this.parentMultiSelect.container);

		this.bodyEditor = new HTMLEditor();

		form.on('submit', e => this.insert(e));

		return container;
	}

	async add() {

		this.addForm.querySelector('form').reset();

		Sections.show('documentation-form-add');

		this.parentMultiSelect.datalist = this.parentDatalist;

		this.parentMultiSelect.render();

		this.parentMultiSelect.value = '';

		const bodyEditor = this.form.querySelector('.body');

		if(!bodyEditor.querySelector('.html-editor')) {

			bodyEditor.appendChild(this.bodyEditor.container);

			await this.bodyEditor.setup();

			this.bodyEditor.container.querySelector('.editor-toggle').insertAdjacentHTML('beforeend', `
				<button type="button" class="preview-enable">
					<i class="far fa-eye"></i>
					<span>Preview</span>
				</button>
				<button type="button" class="preview-disable hidden">
					<i class="far fa-eye-slash"></i>
					<span>Exit Preview</span>
				</button>
			`);

			this.bodyEditor.on('keyup', () => {
				bodyEditor.querySelector('.preview').innerHTML = this.bodyEditor.value;
			});

			this.bodyEditor.container.querySelector('.preview-enable').on('click', () => {
				this.form.querySelector('.body').classList.add('preview-mode');
				this.bodyEditor.container.querySelector('.preview-disable').classList.remove('hidden');
				this.bodyEditor.container.querySelector('.preview-enable').classList.add('hidden');
			});

			this.bodyEditor.container.querySelector('.preview-disable').on('click', () => {
				this.form.querySelector('.body').classList.remove('preview-mode');
				this.bodyEditor.container.querySelector('.preview-enable').classList.remove('hidden');
				this.bodyEditor.container.querySelector('.preview-disable').classList.add('hidden');
			});
		}

		this.bodyEditor.value = '';

		bodyEditor.querySelector('.preview').innerHTML = this.bodyEditor.value;

		this.form.heading.focus();
	}

	async insert(e) {

		e.preventDefault();

		const
			parameters = {
				parent: this.parentMultiSelect.value[0] || '',
				body: this.bodyEditor.value || '',
			},
			options = {
				method: 'POST',
				form: new FormData(this.form),
			};

		try {

			const response = await API.call('documentation/insert', parameters, options);

			await this.load(true);

			new SnackBar({
				message: `Documentation for ${this.form.heading.value} Added`,
				icon: 'fa fa-plus',
			});

		} catch(e) {

			if(e.message.includes('ER_DUP_ENTRY')) {
				e.message = 'Duplicate entry for slug found.';
			}

			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message,
				type: 'error',
			});

			throw e;
		}
	}

	get section() {

		if(this.listElement) {
			return this.listElement;
		}

		const container = this.listElement = document.createElement('section');
		container.classList.add('section');
		container.id = 'documentation-list';

		container.innerHTML = `
			<h1>Documentation</h1>

			<header class="toolbar">
				<button id="add-documentation"><i class="fa fa-plus"></i> Add New Documentation</button>
			</header>

			<table class="block">
				<thead>
					<th>Heading</th>
					<th>Slug</th>
					<th>Parent</th>
					<th>Chapter</th>
					<th>Added by</th>
					<th class="action">Edit</th>
					<th class="action">Delete</th>
				</thead>
				<tbody></tbody>
			</table>
		`;

		container.querySelector('#documentation-list #add-documentation').on('click', () => this.add());

		return container;
	}
})

Settings.list.set('executingReports', class ExecutingReports extends SettingPage {

	get name() {

		return 'Executing Reports';
	}

	setup() {

		if(this.page.querySelector('.executing-reports')) {
			this.page.querySelector('.executing-reports').remove();
		}

		this.sortTable = new SortTable({
			table: this.container.querySelector('#executing-reports table'),
		});

		this.page.appendChild(this.container);
	}

	async load() {

		let reports = await API.call('reports/engine/executingReports');

		this.executingReports = new Set();

		for(const report of reports) {
			this.executingReports.add(new ExecutingReport(report, this));
		}

		await this.render();

	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');
		container.classList.add('setting-page', 'executing-reports', 'hidden');

		container.innerHTML = `
			<section class="section show" id="executing-reports">
				<h1>Executing Reports</h1>

				<header class="toolbar block">
					<label>
						<input type="checkbox" name="auto-refresh">
						Auto Refresh
					</label>
				</header>

				<table class="block">
					<thead>
						<tr>
							<th>Account Name</th>
							<th>Query Id</th>
							<th>Report Name</th>
							<th>User</th>
							<th>Connection Type</th>
							<th>Execution Timestamp</th>
						</tr>
					</thead>
					<tbody></tbody>
				</table>
			</section>
		`;

		const autoRefresh = container.querySelector('input[name=auto-refresh]');

		autoRefresh.on('change', async () => {

			if(autoRefresh.checked) {

				await Storage.set('auto-refresh', true);
				Settings.autoRefreshInterval =  setInterval(async () => await this.load(), 5000);
			}
			else {

				await Storage.set('auto-refresh', false);
				clearInterval(Settings.autoRefreshInterval);
			}
		});

		return container;
	}

	async render() {

		if(!(await Storage.has('auto-refresh'))) {
			await Storage.set('auto-refresh', true);
		}

		const getAutoRefresh = await Storage.get('auto-refresh');

		if(getAutoRefresh) {

			clearInterval(Settings.autoRefreshInterval);

			Settings.autoRefreshInterval =  setInterval(async () => await this.load(), 5000);
		}

		this.container.querySelector('input[name=auto-refresh]').checked = getAutoRefresh ? true : false;

		const tbody = this.container.querySelector('table tbody');

		tbody.textContent = null;

		if(!this.executingReports.size) {
			tbody.innerHTML = '<tr><td class="NA" colspan="4">No executing reports at this time.</td></tr>';
		}

		for(const report of this.executingReports.values()) {
			tbody.appendChild(report.row);
		}

		this.sortTable.sort();

		await Sections.show('executing-reports');
	}
});

Settings.list.set('cachedReports', class CachedReports extends SettingPage {

	constructor(...params) {

		super(...params);
		this.reports = new Set();
	}

	get name() {
		return 'Cached Reports';
	}

	async setup() {

		if(this.page.querySelector('.cached-reports')) {
			this.page.querySelector('.cached-reports').remove();
		}

		this.sortTable = new SortTable({
			table: this.container.querySelector('#cached-reports table'),
		});

		this.page.appendChild(this.container);
	}

	async load() {

		const response = await this.fetch();

		this.process(response);

		this.render();
	}

	async fetch() {

		return API.call('reports/engine/cachedReports');
	}

	process(response) {

		this.reports.clear();

		for(const report of response) {
			this.reports.add(new CachedReport(report));
		}
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');
		container.classList.add('setting-page', 'cached-reports', 'hidden');

		container.innerHTML = `
			<section class="section show" id="cached-reports">
				<h1>Cached Reports</h1>

				<table class="block">
					<thead>
						<tr>
							<th>Query Id</th>
							<th>Size</th>
							<th>Created At</th>
						</tr>
					</thead>
					<tbody></tbody>
				</table>
			</section>
		`;

		return container;
	}

	render() {

		const tbody = this.container.querySelector('table tbody');

		tbody.textContent = null;

		if(!this.reports.size) {
			tbody.innerHTML = '<tr><td class="NA" colspan="4">No redis reports at this time.</td></tr>';
		}

		for(const report of this.reports.values()) {
			tbody.appendChild(report.row);
		}

		this.sortTable.sort();

		Sections.show('cached-reports');
	}
});

Settings.list.set('alerts', class Alerts extends SettingPage {

	constructor(...params) {

		super(...params);

		const alerts = [
			{
				name: 'Datasets Having No Redis',
				api: 'alerts/noRedisDatasets'
			}
		];

		this.alerts = new Map(alerts.map(x => [x.name, new Alert(x)]));
	}

	get name() {

		return 'Alerts';
	}

	setup() {

		if(this.page.querySelector('.alerts')) {

			this.page.querySelector('.alerts').remove();
		}

		this.page.appendChild(this.container);
	}

	get container() {

		if(this.alertsContainer) {

			return this.alertsContainer;
		}

		const container = this.alertsContainer = document.createElement('div');
		container.classList.add('setting-page', 'alerts', 'hidden');

		container.innerHTML = `
			<section class="section show" id="alerts">
				<h1>Alerts</h1>
				<div class="list"></div>
			</section>
		`;

		return container;
	}

	async load() {

		const list = this.container.querySelector('.list');

		list.textContent = null;

		for(const alert of this.alerts.values()) {

			alert.response = null;
			alert.resetContainer();
			list.appendChild(alert.container);
		}

		await Sections.show('alerts');
	}

});

Settings.list.set('about', class About extends SettingPage {

	get name() {
		return 'About';
	}

	setup() {

		this.container = this.page.querySelector('.about-page');
		this.section = this.container.querySelector('#about');

		this.section.innerHTML = `
			<h1>About</h1>
		`;
	}

	async load() {

		this.environment = await API.call('environment/about');
		this.serviceWorkerLoadTime = await page.serviceWorker.message('startTime');

		this.render();
	}

	render() {

		const
			infoContainer = this.infoContainer,
			clearCacheContainer = this.clearCacheContainer;

		this.section.appendChild(clearCacheContainer);
		this.section.appendChild(infoContainer);
		this.section.appendChild(this.environmentAbout);

		Sections.show('about')
	}

	get clearCacheContainer() {

		if(this.cacheContainerElement) {
			return this.cacheContainerElement;
		}

		const button = this.cacheContainerElement = document.createElement('button');
		button.classList.add('clear-cache');
		button.innerHTML = '<i class="fas fa-eraser"></i> Clear Cache';

		button.on('click', async (e) => await Page.clearCache());

		return button;
	}

	get infoContainer() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('info');

		let serviceWorkerLoadTime = `
			${Format.ago(this.serviceWorkerLoadTime)}<br>
			<span class="NA">${Format.dateTime(this.serviceWorkerLoadTime)}</span>
		`;

		if(!page.serviceWorker.status) {
			serviceWorkerLoadTime = `<span>Service Worker Not Active</span>`;
		}

		container.innerHTML = `
			<span class="key">Account Id</span>
			<span class="value">${account.account_id}</span>

			<span class="key">Environment</span>
			<span class="value">${this.environment.name}</span>

			<span class="key">Last Deployed</span>
			<span class="value" id="deployed-on"></span>

			<span class="key">Service Worker Deployed On</span>
			<span class="value">${serviceWorkerLoadTime}</span>

			<span class="key">Git Checksum</span>
			<span class="value">
				<a href="https://github.com/Jungle-Works/AllSpark/commit/${this.environment.gitChecksum}" target="_blank">
					${this.environment.gitChecksum}
				</a>
			</span>

			<span class="key">Branch</span>
			<span class="value">
				<a href="https://github.com/Jungle-Works/AllSpark/tree/${this.environment.branch}" target="_blank">
					${this.environment.branch}
				</a>
			</span>

			<span class="key">Login</span>
			<span class="value" id="login-time"></span>

			<span class="key">Last Token Refresh</span>
			<span class="value" id="last-token-refresh"></span>
		`;

		setInterval(() => this.updateTimestamps(), 1000);

		this.updateTimestamps();

		return container;
	}

	get environmentAbout() {

		if(this.environmentAboutcontainer) {

			return this.environmentAboutcontainer;
		}

		const container = this.environmentAboutcontainer = document.createElement('div');

		container.classList.add('environment-about');

		container.innerHTML = `
			<h2>Services</h2>
			
			<table class="block">
				<thead>
					<th>Services</th>
					<th>Running</th>
					<th>Time</th>
					<th>Port</th>
					<th>Message</th>
				</thead>
				<tbody></tbody>
			</table>
		`;

		const tbody = container.querySelector('table tbody');

		for(const key in this.environment.services) {

			const tr = document.createElement('tr');

			tr.innerHTML = `
				<td>${key}</td>
				<td class="${this.environment.services[key].status ? 'green' : 'red'}">${this.environment.services[key].status}</td>
				<td>${this.environment.services[key].time || ''}</td>
				<td>${this.environment.services[key].port || ''}</td>
				<td>${this.environment.services[key].message}</td>
			`;

			tbody.appendChild(tr);
		}

		(new SortTable({table: container.querySelector('table')})).sort();

		return container;
	}

	async updateTimestamps() {

		const refreshToken = await Storage.get('refresh_token');

		if(!refreshToken) {
			return;
		}

		const decodedToken = JSON.parse(atob(refreshToken.split('.')[1]));

		const
			refreshTokenInfo  = {
				...JSON.parse(decodeURIComponent(decodedToken.data)),
				iat: decodedToken.iat,
				exp: decodedToken.exp
			},

			loginExpiry = this.timeFormat(refreshTokenInfo.exp * 1000),
			loginExpiryText = loginExpiry.direction >= 0 ? `Expires in ${loginExpiry.value}` : `Expired ${loginExpiry.value} ago`,

			tokenExpiry = this.timeFormat(page.user.exp * 1000),
			tokenExpiryText = tokenExpiry.direction >= 0 ? `Expires in ${tokenExpiry.value}` : `Expired ${tokenExpiry.value} ago`;

		this.infoContainer.querySelector('#deployed-on').innerHTML = `
			${Format.ago(this.environment.deployed_on)}<br>
			<span class="NA">${Format.dateTime(this.environment.deployed_on)}</span>
		`;

		this.infoContainer.querySelector('#login-time').innerHTML = `
			${Format.ago(refreshTokenInfo.iat * 1000)}  &nbsp; &middot; &nbsp;
			${loginExpiryText}
			<progress min="0" max="${refreshTokenInfo.exp - refreshTokenInfo.iat}" value="${Math.min(Date.now() / 1000 - refreshTokenInfo.iat, refreshTokenInfo.exp - refreshTokenInfo.iat)}"></progress>
			<span class="NA">
				${Format.dateTime(refreshTokenInfo.iat * 1000)} &nbsp; &middot; &nbsp;
				${Format.dateTime(refreshTokenInfo.exp * 1000)}
			</span>
		`;

		this.infoContainer.querySelector('#last-token-refresh').innerHTML = `
			${Format.ago(page.user.iat * 1000)}  &nbsp; &middot; &nbsp;
			${tokenExpiryText}
			<progress min="0" max="${page.user.exp - page.user.iat}" value="${Math.min(Date.now() / 1000 - page.user.iat, page.user.exp - page.user.iat)}"></progress>
			<span class="NA">
				${Format.dateTime(page.user.iat * 1000)} &nbsp; &middot; &nbsp;
				${Format.dateTime(page.user.exp * 1000)}
			</span>
		`;
	}

	timeFormat(time) {

		let
			values = [
				{value: Math.floor(Math.abs(time - Date.now()) / 1000 / 60 / 60 / 24), unit: 'day'},
				{value: Math.floor(Math.abs(time - Date.now()) / 1000 / 60 / 60) % 24, unit: 'hour'},
				{value: Math.floor(Math.abs(time - Date.now()) / 1000 / 60) % 60, unit: 'minute'},
				{value: Math.floor(Math.abs(time - Date.now()) / 1000) % 60, unit: 'second'},
			],
			zeroSinceBegining = true;

		values = values.filter(value => {

			if(value.value > 1) {
				value.unit += 's';
			}

			if(!value.value && zeroSinceBegining) {
				return false;
			}

			zeroSinceBegining = false;

			return true;
		});

		return {
			direction: time - Date.now() > 0 ? 1 : time - Date.now() < 0 ? -1 : 0,
			value: values.map(t => t.value + ' ' + t.unit).join(', '),
		};
	}
});

class SettingsAccount {

	constructor(account, page) {

		Object.assign(this, account);

		this.page = page;

		this.form = this.page.form.querySelector('#account-form');

		page.container.querySelector('#cancel-form').on('click', () => Sections.show('accounts-list'));
	}

	static async add(page) {

		SettingsAccount.form = page.form.querySelector('#account-form');

		SettingsAccount.form.reset();

		SettingsAccount.form.logo.src = '';
		SettingsAccount.form.querySelector('#logo').classList.add('hidden');

		SettingsAccount.form.icon.src = '';
		SettingsAccount.form.querySelector('#icon').classList.add('hidden');

		if(SettingsAccount.form.parentElement.querySelector('.feature-form')) {
			SettingsAccount.form.parentElement.querySelector('.feature-form').remove();
		}

		if(SettingsAccount.form.parentElement.querySelector('.settings-manager')) {
			SettingsAccount.form.parentElement.querySelector('.settings-manager').remove();
		}

		await Sections.show('accounts-form');

		page.form.querySelector('h1').textContent = 'Add New Account';

		SettingsAccount.form.removeEventListener('submit', SettingsAccount.submitEventListener);
		SettingsAccount.form.on('submit', SettingsAccount.submitEventListener = e => SettingsAccount.insert(e, page));

		SettingsAccount.form.name.focus();
	}

	static async insert(e, page) {

		if(e && e.preventDefault) {
			e.preventDefault();
		}

		const options = {
			method: 'POST',
			form: new FormData(SettingsAccount.form),
		};

		try {

			const response = await API.call('accounts/insert', {}, options);

			await page.load();

			page.list.get(response.account_id).edit();

			new SnackBar({
				message: 'Account Added',
				subtitle: `${SettingsAccount.form.name.value} #${response.account_id}`,
				icon: 'fa fa-plus',
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

	async edit() {

		this.page.container.querySelector('#accounts-form h1').textContent = `Editing ${this.name}`;

		this.form.querySelector('#icon').classList.toggle('hidden', !this.icon);
		this.form.querySelector('#icon').src = this.icon;

		this.form.querySelector('#logo').classList.toggle('hidden', !this.logo);
		this.form.querySelector('#logo').src = this.logo;

		for(const input of this.form.elements) {

			if(input.name in this) {
				input.value = this[input.name];
			}
		}

		const features = new AccountsFeatures(this);

		if(this.form.parentElement.querySelector('.feature-form')) {
			this.form.parentElement.querySelector('.feature-form').remove();
		}

		const settings_json = [
			{
				key: 'logout_redirect_url',
				type: 'url',
				name: 'Logout Url',
				description: 'Redirect user to specified url',
			},
			{
				key: 'global_filters_position',
				type: 'multiselect',
				name: 'Global Filters Position',
				description: 'Global Filters available on dashboards',
				datalist: [
					{name: 'Top', value: 'top'},
					{name: 'Right', value: 'right'},
				],
				multiple: false,
			},
			{
				key: 'theme',
				type: 'multiselect',
				name: 'Theme',
				description: 'Will be used by default for all users',
				datalist: [
					{name: 'Light', value: 'light'},
					{name: 'Dark', value: 'dark'},
				],
				multiple: false,
			},
			{
				key: 'pre_report_api',
				type: 'url',
				name: 'Pre Report API',
				description: 'An API that is hit before any report is executed',
			},
			{
				key: 'load_saved_connection',
				type: 'number',
				name: 'Store Report Result Connection ID',
				description: 'The Connection where the report\'s result will be saved in',
			},
			{
				key: 'load_saved_database',
				type: 'string',
				name: 'Store Report Result Database',
				description: 'The database where the report\'s result will be saved in',
			},
			{
				key: 'enable_dashboard_share',
				type: 'toggle',
				name: 'Allow Users to share dashboard via email',
			},
			{
				key: 'enable_account_signup',
				type: 'toggle',
				name: 'Allow User Signup',
			},
			{
				key: 'disable_footer',
				type: 'toggle',
				name: 'Disable Footer',
			},
			{
				key: 'user_onboarding',
				type: 'toggle',
				name: 'Enable user onboarding'
			},
			{
				key: 'visualization_roles_from_query',
				type: 'toggle',
				name: 'Visualization Roles From Query',
				description: 'Apply Visualization Roles From Its Parent Report'
			},
			{
				key: 'custom_js',
				type: 'code',
				mode: 'javascript',
				name: 'Custom JavaScript',
				description: 'Custom JavaScript for this account'
			},
			{
				key: 'custom_css',
				type: 'code',
				mode: 'css',
				name: 'Custom CSS',
				description: 'Custom CSS for this account'
			},
			{
				key: 'external_parameters',
				type: 'json',
				name: 'External Parameters',
				description: 'External Parameter for this account'
			},
		];

		const settingsContainer = new SettingsManager({owner: 'account', owner_id: this.account_id, format: settings_json});

		await settingsContainer.load();

		if(this.form.parentElement.querySelector('.settings-manager')) {
			this.form.parentElement.querySelector('.settings-manager').remove();
		}

		this.form.parentElement.appendChild(settingsContainer.container);

		this.form.parentElement.appendChild(features.container);

		this.form.removeEventListener('submit', SettingsAccount.submitEventListener);
		this.form.on('submit', SettingsAccount.submitEventListener = e => this.update(e));

		await Sections.show('accounts-form');
		this.form.name.focus();
	}

	async update(e) {

		if (e && e.preventDefault)
			e.preventDefault();

		const
			parameters = {
				account_id: this.account_id,
			},
			options = {
				method: 'POST',
				form: new FormData(this.form),
			};

		try {

			await API.call('accounts/update', parameters, options);

			await this.page.load();

			new SnackBar({
				message: 'Account Saved',
				subtitle: `${this.form.name.value} #${this.account_id}`,
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
			options = {
				method: 'POST',
			},
			parameter = {
				account_id: this.account_id
			};

		try {

			await API.call('accounts/delete', parameter, options);

			await this.page.load();

			new SnackBar({
				message: 'Account Deleted',
				subtitle: `${this.name} #${this.account_id}`,
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

	get row() {

		const
			tr = document.createElement('tr'),
			urls = [];

		for(const url of this.url.split(',')) {
			urls.push(`<a href="//${url}" target="_blank">${url}</a>`);
		}

		tr.innerHTML = `
			<td>${this.account_id}</td>
			<td>${this.name}</td>
			<td>${urls.join(' &nbsp;&middot;&nbsp; ')}</td>
			<td><img src="${this.icon}" height="30"></td>
			<td><img src="${this.logo}" height="30"></td>
			<td class="action green" title="Edit"><i class="far fa-edit"></i></td>
			<td class="action red" title="Delete"><i class="far fa-trash-alt"></i></td>
		`;

		tr.querySelector('.green').on('click', () => this.edit());
		tr.querySelector('.red').on('click', () => this.delete());

		return tr;
	}
}

class AccountsFeatures {

	constructor(account) {

		this.account = account;

		this.totalFeatures = new Map;

		for(const [key, feature] of MetaData.features) {
			feature.status = this.account.features.includes(key.toString());
			this.totalFeatures.set(key, new AccountsFeature(feature, this.account));
		}

		this.sortTable = new SortTable();
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('feature-form');

		container.innerHTML = `

			<h3>Features</h3>

			<div class="toolbar form">

				<label class="feature-type">
					<span>Types</span>
				</label>

				<label>
					<span>Search</span>
					<input id="feature-search" type="text" placeholder="Search..">
				</label>
			</div>

			<div class="table-container">
				<table>
					<thead>
						<tr>
							<th>ID</th>
							<th>Type</th>
							<th>Name</th>
							<th>Slug</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody></tbody>
				</table>
			</div>
		`;

		let list = new Set;

		for(const value of MetaData.features.values()) {
			list.add(value.type);
		}

		list = Array.from(list).map(x => {return {name: x, value: x}});

		this.featureType = new MultiSelect({datalist: Array.from(list), multiple: true});

		container.querySelector('.feature-type').appendChild(this.featureType.container);

		container.querySelector('#feature-search').on('keyup', () => this.render());

		this.featureType.on('change', () => this.render());

		this.render();

		this.sortTable.table = container.querySelector('.table-container table');
		this.sortTable.sort();

		return container;
	}

	render() {

		const
			tbody = this.container.querySelector('tbody'),
			selectedTypes = this.featureType.value,
			searchQuery = this.container.querySelector('#feature-search').value.toLowerCase();

		tbody.textContent = null;

		for(const feature of this.totalFeatures.values()) {

			if(selectedTypes.length && !selectedTypes.includes(feature.type)) {
				continue;
			}

			if(searchQuery && !feature.name.toLowerCase().includes(searchQuery) && !(feature.status ? 'enabled' : 'disabled').includes(searchQuery)) {
				continue;
			}

			tbody.appendChild(feature.row);
		}

		if(!tbody.children.length) {
			tbody.innerHTML = '<tr><td colspan=4 class="NA">No Feature found</td></tr>';
		}
	}
}

class AccountsFeature {

	constructor(feature, account) {

		for(const key in feature)
			this[key] = feature[key];

		this.account = account;
	}

	get row() {

		if(this.rowElement)
			return this.rowElement;

		const tr = this.rowElement = document.createElement('tr');

		tr.innerHTML = `
			<td>${this.feature_id}</td>
			<td>${this.type}</td>
			<td>${this.name}</td>
			<td>${this.slug}</td>
			<td class="feature-toggle" data-sort-by="${this.status}">
				<div>
					<label><input type="radio" name="status-${this.feature_id}" value="1"> Enabled</label>
					<label><input type="radio" name="status-${this.feature_id}" value="0"> Disabled</label>
				<div>
			</td>
		`;

		for(const input of tr.querySelectorAll('input')) {

			if(parseInt(input.value) == this.status)
				input.checked = true;

			input.on('change', e => {
				tr.querySelector('.feature-toggle').dataset.sortBy = input.value;
				this.update(e, parseInt(input.value));
			});
		}

		return tr;
	}

	async update(e, status) {

		e.preventDefault();

		const
			options = {
				method: 'POST',
			},
			parameter = {
				account_id: this.account.account_id,
				feature_id: this.feature_id,
				status,
			};

		try {

			await API.call('accounts/features/toggle', parameter, options);

			new SnackBar({
				message: `${this.name} Feature ${status ? 'Enabled' : 'Disabled'}`,
				subtitle: this.type,
				icon: status ? 'fas fa-check' : 'fas fa-ban',
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
}

class GlobalFilter {

	constructor(globalFilter, globalFilters) {

		for (const key in globalFilter)
			this[key] = globalFilter[key];

		this.globalFilters = globalFilters;
	}

	static add(globalFilters) {

		globalFilters.datasetsMultiselect.clear();

		const container = globalFilters.container.querySelector('#global-filters-form .dashboard-ids');

		const datalist = globalFilters.dashboardList.map(d => {return {name: d.name, value: d.id, subtitle: `#${d.id}`}});

		globalFilters.dashboardMultiselect = new MultiSelect({datalist, multiple: false});

		if(container.querySelector('.multi-select')) {
			container.querySelector('.multi-select').remove();
		}

		container.appendChild(globalFilters.dashboardMultiselect.container);

		globalFilters.container.querySelector('#global-filters-form h1').textContent = 'Add new Global Filter';
		globalFilters.form.reset();

		globalFilters.form.removeEventListener('submit', GlobalFilter.submitListener);

		globalFilters.form.on('submit', GlobalFilter.submitListener = e => GlobalFilter.insert(e, globalFilters));

		Sections.show('global-filters-form');

		GlobalFilter.updateDefaultType(globalFilters);

		globalFilters.form.type.removeEventListener('change', GlobalFilter.typeChangeListener);

		globalFilters.form.on('change', GlobalFilter.typeChangeListener = () => GlobalFilter.changeFilterType(globalFilters));

		globalFilters.form.default_type.on('change', () => GlobalFilter.updateDefaultType(globalFilters));

		globalFilters.form.name.focus();
	}

	static updateDefaultType(globalFilters) {

		const default_type = globalFilters.form.default_type;

		globalFilters.form.default_value.classList.toggle('hidden', default_type.value != 'default_value');
		globalFilters.form.offset.classList.toggle('hidden', default_type.value != 'offset');
	}

	static changeFilterType(globalFilters) {

		const types = ['hidden', 'column', 'literal'];

		if(globalFilters.form.type.value == 'datetime') {
			globalFilters.form.default_value.type = 'datetime-local';
		}

		else if(types.includes(globalFilters.form.type.value)) {
			globalFilters.form.default_value.type = 'text';
		}

		else {
			globalFilters.form.default_value.type = globalFilters.form.type.value;
		}
	}

	static async insert(e, globalFilters) {

		e.preventDefault();

		if(globalFilters.form.default_type.value != 'offset') {
			globalFilters.form.offset.value = '';
		}

		if(globalFilters.form.default_type.value != 'default_value') {
			globalFilters.form.default_value.value = '';
		}

		const
			parameters = {
				dataset: globalFilters.datasetsMultiselect.value,
				dashboard_id: globalFilters.dashboardMultiselect.value[0] || '',
			},
			options = {
				method: 'POST',
				form: new FormData(globalFilters.form),
			};

		try {

			const response = await API.call('global-filters/insert', parameters, options);

			await globalFilters.load();

			new SnackBar({
				message: `${globalFilters.form.name.value} Global Filter Added`,
				subtitle: `Type: <strong>${MetaData.filterTypes.get(globalFilters.form.type.value).name}</strong> Placeholer: <strong>${globalFilters.form.placeholder.value}</strong></span>`,
				icon: 'fa fa-plus',
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

	get row() {

		if (this.container) {
			return this.container;
		}

		let dataset = '';

		if(DataSource.list.has(this.dataset))
			dataset = DataSource.list.get(this.dataset).name;

		this.container = document.createElement('tr');

		const [dashboard] = this.globalFilters.dashboardList.filter(d => d.id == this.dashboard_id);

		this.container.innerHTML = `
			<td>${this.id}</td>
			<td>${this.name}</td>
			<td>${this.placeholder}</td>
			<td>${this.type}</td>
			<td>${isNaN(parseFloat(this.order)) ? '' : this.order}</td>
			<td>${dashboard ? dashboard.name : ''}</td>
			<td>${this.default_value}</td>
			<td>${this.multiple ? 'Yes' : 'No'}</td>
			<td>${isNaN(parseInt(this.offset)) ? '' : this.offset}</td>
			<td><a target="_blank" href="/report/${this.dataset}">${dataset}</a></td>
			<td class="action green" title="Edit"><i class="far fa-edit"></i></td>
			<td class="action red" title="Delete"><i class="far fa-trash-alt"></i></td>
		`;

		this.container.querySelector('.green').on('click', () => this.edit());
		this.container.querySelector('.red').on('click', () => this.delete());

		return this.container;
	}

	async edit() {

		this.globalFilters.form.reset();

		for(const element of this.globalFilters.form.elements) {

			if(element.name in this) {
				element.value = this[element.name];
			}
		}

		this.globalFilters.form.offset.value = isNaN(parseInt(this.offset)) ? '' : this.offset;
		this.globalFilters.datasetsMultiselect.value = this.dataset;

		const container = this.globalFilters.container.querySelector('#global-filters-form .dashboard-ids');

		const datalist = this.globalFilters.dashboardList.map(d => {return {name: d.name, value: d.id, subtitle: `#${d.id}`}});

		this.dashboardMultiselect = new MultiSelect({datalist, multiple: false});

		if(container.querySelector('.multi-select'))
			container.querySelector('.multi-select').remove();

		container.appendChild(this.dashboardMultiselect.container);

		this.dashboardMultiselect.value = this.dashboard_id;

		this.globalFilters.container.querySelector('#global-filters-form h1').textContent = 'Edit ' + this.name;

		this.globalFilters.form.removeEventListener('submit', GlobalFilter.submitListener);
		this.globalFilters.form.on('submit', GlobalFilter.submitListener = e => this.update(e));

		await Sections.show('global-filters-form');

		const
			default_value = this.globalFilters.form.default_value.value,
			default_value_offset = this.globalFilters.form.offset.value;

		if(this.globalFilters.form.default_value.value) {
			this.globalFilters.form.default_type.value = 'default_value';
		}

		else if(this.globalFilters.form.offset.value) {
			this.globalFilters.form.default_type.value = 'offset';
		}

		else {
			this.globalFilters.form.default_type.value = 'none';
		}

		GlobalFilter.changeFilterType(this.globalFilters);

		this.globalFilters.form.type.removeEventListener('change', GlobalFilter.typeChangeListener);

		this.globalFilters.form.type.on('change', GlobalFilter.typeChangeListener = () => {

			GlobalFilter.changeFilterType(this.globalFilters);

			this.globalFilters.form.default_value.value = default_value;
			this.globalFilters.form.offset.value = default_value_offset;
		});

		GlobalFilter.updateDefaultType(this.globalFilters);

		this.globalFilters.form.default_type.on('change', () => GlobalFilter.updateDefaultType(this.globalFilters));

		this.globalFilters.form.name.focus();
	}

	async update(e) {

		e.preventDefault();

		if(this.globalFilters.form.default_type.value != 'offset') {
			this.globalFilters.form.offset.value = '';
		}

		if(this.globalFilters.form.default_type.value != 'default_value') {
			this.globalFilters.form.default_value.value = '';
		}

		const
			parameter = {
				id: this.id,
				dataset: this.globalFilters.datasetsMultiselect.value,
				dashboard_id: this.dashboardMultiselect.value[0] || '',
			},
			options = {
				method: 'POST',
				form: new FormData(this.globalFilters.form),
			};

		try {

			await API.call('global-filters/update', parameter, options);

			await this.globalFilters.load();

			new SnackBar({
				message: `${this.globalFilters.form.name.value} Global Filter Saved`,
				subtitle: `Type: <strong>${MetaData.filterTypes.get(this.globalFilters.form.type.value).name}</strong> Placeholer: <strong>${this.globalFilters.form.placeholder.value}</strong></span>`,
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

		if (!confirm('Are you sure?')) {
			return;
		}

		const
			options = {
				method: 'POST',
			},
			parameter = {
				id: this.id,
			};

		try {

			await API.call('global-filters/delete', parameter, options);

			await this.globalFilters.load();

			new SnackBar({
				message: `${this.name} Global Filter Deleted`,
				subtitle: `Type: <strong>${MetaData.filterTypes.get(this.type).name}</strong> Placeholer: <strong>${this.placeholder}</strong>`,
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
}

class DocumentationEdit {

	constructor(documentation, page) {

		Object.assign(this, documentation);

		this.page = page;
	}

	get row() {

		if (this.rowElement) {
			return this.rowElement;
		}

		const container = this.rowElement = document.createElement('tr');

		const [parent] = this.page.parentDatalist.filter(x => x.value == this.parent);

		container.innerHTML = `
			<td>${this.heading}</td>
			<td>${this.slug}</td>
			<td>${parent ? parent.name : ''}</td>
			<td>${this.chapter}</td>
			<td>${this.name}</td>
			<td class="action green" title="Edit"><i class="far fa-edit"></i></td>
			<td class="action red" title="Delete"><i class="far fa-trash-alt"></i></td>
		`;

		container.querySelector('.green').on('click', () => this.edit());
		container.querySelector('.red').on('click', () => this.delete());

		return container;
	}

	get form() {

		if(this.formElement) {
			return this.formElement;
		}

		const container = this.formElement = document.createElement('section');
		container.classList.add('section', 'edit-form');
		container.id = `documentation-form-${this.id}`;

		container.innerHTML = `

			<h1></h1>

			<header class="toolbar">
				<button id="cancel-form"><i class="fa fa-arrow-left"></i> Back</button>
				<button type="submit" form="documentation-${this.id}"><i class="far fa-save"></i> Save</button>
			</header>

			<form class="block form" id="documentation-${this.id}">
				<label>
					<span>Heading <span class="red">*</span></span>
					<input type="text" name="heading" required>
				</label>

				<label>
					<span>Slug <span class="red">*</span><a data-tooltip="Auto generate the slug from heading." class="generate-slug">Generate</a></span>
					<input type="text" name="slug" required>
				</label>

				<label class="parent">
					<span>Parent</span>
				</label>

				<label>
					<span>Chapter <span class="red">*</span></span>
					<input type="number" name="chapter" min="1" step="1" required>
				</label>

				<div class="body">
					<span>Body</span>
					<span class="preview-label">Preview</span>
					<div class="preview documentation"></div>
				</div>
			</form>
		`;

		container.querySelector('.generate-slug').on('click', () => {

			const
				heading = container.querySelector('form').heading.value,
				slug = heading.toLowerCase().split(' ').join('_');

			container.querySelector('form').slug.value = slug;
		});

		container.querySelector('#cancel-form').on('click', () => {
			Sections.show('documentation-list');
		});

		this.parentMultiSelect = new MultiSelect({multiple: false});

		container.querySelector('.parent').appendChild(this.parentMultiSelect.container);

		this.bodyEditor = new HTMLEditor();

		container.querySelector('.form').on('submit', e => {
			this.update(e);
		});

		return container;
	}

	async edit() {

		for(const element of this.form.querySelector('form').elements) {

			if(element.name in this) {
				element.value = this[element.name];
			}
		}

		await Sections.show(`documentation-form-${this.id}`);

		this.form.querySelector('h1').innerHTML = `Edit Documentation for ${this.heading}`;

		const datalist = this.page.parentDatalist.filter(x => x.value != this.id);

		this.parentMultiSelect.datalist = datalist;

		this.parentMultiSelect.render();

		this.parentMultiSelect.value = [this.parent];

		const bodyEditior = this.form.querySelector('.body');

		if(!bodyEditior.querySelector('.html-editor')) {

			bodyEditior.appendChild(this.bodyEditor.container);

			await this.bodyEditor.setup();

			this.bodyEditor.container.querySelector('.editor-toggle').insertAdjacentHTML('beforeend', `
				<button type="button" class="preview-enable">
					<i class="far fa-eye"></i>
					<span>Preview</span>
				</button>
				<button type="button" class="preview-disable hidden">
					<i class="far fa-eye-slash"></i>
					<span>Exit Preview</span>
				</button>
			`);

			this.bodyEditor.on('keyup', () => {
				bodyEditior.querySelector('.preview').innerHTML = this.bodyEditor.value;
			});

			this.bodyEditor.container.querySelector('.preview-enable').on('click', () => {
				this.form.querySelector('.body').classList.add('preview-mode');
				this.bodyEditor.container.querySelector('.preview-disable').classList.remove('hidden');
				this.bodyEditor.container.querySelector('.preview-enable').classList.add('hidden');
			});

			this.bodyEditor.container.querySelector('.preview-disable').on('click', () => {
				this.form.querySelector('.body').classList.remove('preview-mode');
				this.bodyEditor.container.querySelector('.preview-enable').classList.remove('hidden');
				this.bodyEditor.container.querySelector('.preview-disable').classList.add('hidden');
			});
		}

		this.bodyEditor.value = this.body;

		bodyEditior.querySelector('.preview').innerHTML = this.bodyEditor.value;
	}

	async update(e) {

		e.preventDefault();

		const
			parameter = {
				id: this.id,
				parent: this.parentMultiSelect.value[0] || '',
				body: this.bodyEditor.value || '',
			},
			options = {
				method: 'POST',
				form: new FormData(this.form.querySelector('form')),
			};

		try {

			await API.call('documentation/update', parameter, options);

			await this.page.load(true);

			new SnackBar({
				message: `Documentation for ${this.heading} updated`,
				icon: 'far fa-save',
			});

		} catch(e) {

			if(e.message.includes('ER_DUP_ENTRY')) {
				e.message = 'Duplicate entry for chapter found.';
			}

			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message,
				type: 'error',
			});

			throw e;
		}
	}

	async delete() {

		if (!confirm('Are you sure?')) {
			return;
		}

		const
			options = {
				method: 'POST',
			},
			parameter = {
				id: this.id,
			};

		try {

			await API.call('documentation/delete', parameter, options);

			await this.page.load(true);

			new SnackBar({
				message: `Documentation for ${this.heading} Deleted`,
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
}

class SettingsPrivilege {

	constructor(privilege, privileges) {

		for (const key in privilege) {
			this[key] = privilege[key];
		}

		this.privileges = privileges;
	}

	static async add(privileges) {

		privileges.container.querySelector('#privileges-form h1').textContent = 'Add new Privileges';
		privileges.form.reset();

		if(privileges.form.parentElement.querySelector('.privilege-component')) {
			privileges.form.parentElement.querySelector('.privilege-component').remove();
		}

		privileges.form.removeEventListener('submit', SettingsPrivilege.submitListener);
		privileges.form.on('submit', SettingsPrivilege.submitListener = e => SettingsPrivilege.insert(e, privileges));

		await Sections.show('privileges-form');
		privileges.form.name.focus();
	}

	static async insert(e, privileges) {

		e.preventDefault();

		const options = {
			method: 'POST',
			form: new FormData(privileges.form),
		};

		try {

			const response = await API.call('privileges/insert', {}, options);

			await privileges.load();

			new SnackBar({
				message: 'Privilege Added',
				subtitle: `${privileges.form.name.value} #${response.insertId}`,
				icon: 'fa fa-plus',
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

	get row() {

		if (this.rowElement) {
			return this.rowElement;
		}

		const row = this.rowElement = document.createElement('tr');

		row.innerHTML = `
			<td>${this.privilege_id}</td>
			<td>${this.name}</td>
			<td>${this.is_admin ? 'Yes' : 'No'}</td>
			<td class="action green" title="Edit" disabled><i class="far fa-edit"></i></td>
			<td class="action red" title="Delete"><i class="far fa-trash-alt"></i></td>
		`;

		if(!row.querySelector('.green.NA')) {
			row.querySelector('.green').on('click', () => this.edit());
		}

		if(!row.querySelector('.red.NA')) {
			row.querySelector('.red').on('click', () => this.delete());
		}

		return row;
	}

	async edit() {

		this.privileges.container.querySelector('#privileges-form h1').textContent = 'Edit ' + this.name;
		this.privileges.form.reset();

		this.privileges.form.name.value = this.name;
		this.privileges.form.is_admin.value = this.is_admin;

		this.privilegeComponent = new PrivilegeComponents(this);
		await this.privilegeComponent.load();

		if(this.privileges.form.parentElement.querySelector('.privilege-component'))
			this.privileges.form.parentElement.querySelector('.privilege-component').remove();

		this.privileges.form.parentElement.appendChild(this.privilegeComponent.container);

		this.privileges.form.removeEventListener('submit', SettingsPrivilege.submitListener);
		this.privileges.form.on('submit', SettingsPrivilege.submitListener = e => this.update(e));

		await Sections.show('privileges-form');
		this.privileges.form.name.focus();
	}

	async update(e) {

		e.preventDefault();

		const
			parameter = {
				privilege_id: this.privilege_id,
			},
			options = {
				method: 'POST',
				form: new FormData(this.privileges.form),
			};

		try {

			await API.call('privileges/update', parameter, options);

			await this.privileges.load();

			new SnackBar({
				message: 'Privilege Saved',
				subtitle: `${this.privileges.form.name.value} #${this.privilege_id}`,
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

		if (!confirm('Are you sure?')) {
			return;
		}

		const
			parameter = {
				privilege_id: this.privilege_id,
			},
			options = {
				method: 'POST',
			};

		try {

			await API.call('privileges/delete', parameter, options);

			await this.privileges.load();

			new SnackBar({
				message: 'Privilege Deleted',
				subtitle: `${this.name} #${this.privilege_id}`,
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
}

class PrivilegeComponents extends Set {

	constructor(privilege) {

		super();

		Object.assign(this, privilege);

		this.list = this.privileges.list;
	}

	async load() {

		await this.fetch();

		await this.process();

		this.render();
	}

	async fetch() {

		const
			 options = {
				'method': 'POST',
			},
			parameter = {
				id: this.privilege_id,
			};

		this.response = await API.call('privileges_manager/list', parameter, options);
	}

	process() {

		this.list = new Map;

		for(const data of this.response || []) {
			this.list.set(data.id, new PrivilegeComponent(data, this));
		}
	}

	render() {

		const formContainer = this.container;

		formContainer.querySelector('.component-list').textContent = null;

		for(const component of this.list.values()) {
			formContainer.querySelector('.component-list').appendChild(component.row);
		}

		if(!this.list.size) {
			formContainer.querySelector('.component-list').innerHTML = `<div class='NA'>No Components found.</div>`;
		}
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('privilege-component');
		container.innerHTML = `
			<h3>Privileges Component</h3>

			<form class="headings">

				<label><span>Id</span></label>
				<label><span>Privilege Name</span></label>
				<label><span></span></label>
			</form>

			<div class="component-list"></div>

			<form class="add-new-container">

				<label class="add-new"></label>
				<label>
					<button type="submit"><i class="fa fa-plus"></i>Add</button>
				</label>
			</form>
		`;

		const list = [];

		for(const privilege of this.privileges.list.values()) {

			if(privilege.privilege_id != this.privilege_id) {
				list.push({name: privilege.name, value: privilege.privilege_id});
			}
		}

		this.multiSelect = new MultiSelect({datalist: list, multiple: false, mode: 'collapse'});

		container.querySelector('label.add-new').appendChild(this.multiSelect.container);

		container.querySelector('form.add-new-container').on('submit', (e) => this.add(e));

		return container;
	}

	async add(e) {

		e.preventDefault();

		try {
			const
				options = {
					method: "POST",
				},
				parameters = {
					parent: this.multiSelect.value[0],
					privilege_id: this.privilege_id,
				};

			const result = await API.call('privileges_manager/insert', parameters, options);

			new SnackBar({
				message: 'Added successfully',
				subtitle: '',
				icon: 'far fa-save',
			});

			await this.load();
		}
		catch(e) {
			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message,
				type: 'error',
			});

			throw e;
		}
	}
}

class PrivilegeComponent {

	constructor(component, privilegeComponents) {

		for(const key in component) {
			this[key] = component[key];
		}

		this.privilegeComponents = privilegeComponents;
	}

	get row() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createDocumentFragment();

		const id = document.createElement('label');
		id.innerHTML = `<input class="thin" type="number" value=${this.privilege_id} readonly>`;

		const list = document.createElement('label');
		list.innerHTML = `<input type="text" value=${this.privilegeComponents.privileges.list.get(parseInt(this.privilege_id)).name} readonly>`;

		const del = document.createElement('label');
		del.innerHTML = `<button class="action delete"><i class="far fa-trash-alt"></i></button>`;

		del.querySelector('.delete').on('click', () => this.delete());

		container.appendChild(id);
		container.appendChild(list);
		container.appendChild(del);

		return container;
	}

	async delete() {

		if(!confirm('Are you sure?')) {
			return;
		}

		try {

			const
				options = {
					method: "POST",
				},
				parameter = {
					id: this.id,
				};

			const response = await API.call('privileges_manager/sever', parameter, options);

			await this.privilegeComponents.load();

			new SnackBar({
				message: 'Deleted successfully',
				subtitle: '',
				icon: 'far fa-trash-alt',
			});
		}
		catch(e) {

			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message,
				type: 'error',
			});

			throw e;
		}
	}
}

class SettingsRole {

	constructor(role, roles) {

		for(const key in role) {
			this[key] = role[key];
		}

		this.roles = roles;
	}

	static add(roles) {

		roles.container.querySelector('#roles-form h1').textContent = 'Add New Role';
		roles.form.reset();

		roles.form.removeEventListener('submit', SettingsRole.submitListener);
		roles.form.on('submit', SettingsRole.submitListener = e => SettingsRole.insert(e, roles));

		Sections.show('roles-form');
		roles.form.name.focus();
	}

	static async insert(e, roles) {

		e.preventDefault();

		const options = {
			method: 'POST',
			form: new FormData(roles.form),
		};

		try {

			const response = await API.call('roles/insert', {}, options);

			await roles.load();

			new SnackBar({
				message: 'Role Added',
				subtitle: `${roles.form.name.value} #${response.insertId}`,
				icon: 'fa fa-plus',
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

	async edit() {

		this.roles.form.removeEventListener('submit', SettingsRole.submitListener);
		this.roles.form.reset();

		this.roles.form.on('submit', SettingsRole.submitListener = e => this.update(e));
		this.roles.container.querySelector('#roles-form h1').textContent = `Editing ${this.name}`;
		this.roles.form.name.value = this.name;
		this.roles.form.is_admin.value = this.is_admin;

		await Sections.show('roles-form');
		this.roles.form.name.focus();
	}

	async update(e) {

		e.preventDefault();

		const
			parameter = {
				role_id: this.role_id,
			},
			options = {
				method: 'POST',
				form: new FormData(this.roles.form),
			};

		try {

			await API.call('roles/update', parameter, options);

			await this.roles.load();

			new SnackBar({
				message: 'Role Saved',
				subtitle: `${this.roles.form.name.value} #${this.role_id}`,
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

		if(!confirm('Are you sure?')) {
			return;
		}

		const
			parameter = {
				role_id: this.role_id,
			},
			options = {
				method: 'POST',
			};

		try {

			await API.call('roles/delete', parameter, options);

			await this.roles.load();

			new SnackBar({
				message: 'Role Deleted',
				subtitle: `${this.name} #${this.role_id}`,
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

	get row() {

		if(this.container) {
			return this.container;
		}

		this.container = document.createElement('tr');

		this.container.innerHTML = `
			<td>${this.role_id}</td>
			<td>${this.name}</td>
			<td>${this.is_admin ? 'Yes' : 'No'}</td>
			<td class="action green" title="Edit"><i class="far fa-edit"></i></td>
			<td class="action red" title="Delete"><i class="far fa-trash-alt"></i></td>
		`;

		this.container.querySelector('.green').on('click', () => this.edit());
		this.container.querySelector('.red').on('click', () => this.delete());

		return this.container;
	}
}

class SettingsCategory {

	constructor(category, page) {

		Object.assign(this, category);

		this.page = page;
		this.form = this.page.form.querySelector('#category-form');
	}

	static add(page) {

		page.form.querySelector('h1').textContent = 'Add new Category';

		const categoryForm = page.form.querySelector('#category-form');

		SettingsCategory.form = categoryForm;
		categoryForm.reset();

		categoryForm.removeEventListener('submit', SettingsCategory.submitListener);
		categoryForm.on('submit', SettingsCategory.submitListener = e => SettingsCategory.insert(e, page));

		Sections.show('category-edit');
		categoryForm.name.focus();
	}

	static async insert(e, page) {

		e.preventDefault();

		const options = {
			method: 'POST',
			form: new FormData(SettingsCategory.form),
		};

		try {

			const response = await API.call('category/insert', {}, options);

			await page.load();

			new SnackBar({
				message: 'Category Added',
				subtitle: `${SettingsCategory.form.name.value} #${response.insertId}`,
				icon: 'fa fa-plus',
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

	async edit() {

		this.form.removeEventListener('submit', SettingsCategory.submitListener);

		this.form.on('submit', SettingsCategory.submitListener = e => this.update(e));
		this.page.form.querySelector('h1').textContent = `Editing ${this.name}`;

		const formElements = ['name', 'slug', 'parent', 'is_admin'];

		for(const element of formElements) {
			this.form[element].value = this[element];
		}

		await Sections.show('category-edit');
		this.form.name.focus();
	}

	async update(e) {

		if (e.preventDefault) {
			e.preventDefault();
		}

		const
			parameters = {
				category_id: this.category_id,
			},
			options = {
				method: 'POST',
				form: new FormData(this.form),
			};

		try {

			await API.call('category/update', parameters, options);

			await this.page.load();

			new SnackBar({
				message: 'Category Saved',
				subtitle: `${this.form.name.value} #${this.category_id}`,
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

		if(!confirm('Are you sure?')) {
			return;
		}

		const
			parameter = {
				category_id: this.category_id,
			},
			options = {
				method: 'POST',
			};

		try {

			await API.call('category/delete', parameter, options);

			await this.page.load();

			new SnackBar({
				message: 'Category Deleted',
				subtitle: `${this.name} #${this.category_id}`,
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

	get row() {

		if(this.container) {
			return this.container;
		}

		this.container = document.createElement('tr');

		this.container.innerHTML = `
			<td>${this.category_id}</td>
			<td>${this.name}</td>
			<td>${this.slug}</td>
			<td>${parseInt(this.parent) || ''}</td>
			<td>${this.is_admin ? 'Yes' : 'No'}</td>
			<td class="action edit" title="Edit"><i class="far fa-edit"></i></td>
			<td class="action delete" title="Delete"><i class="far fa-trash-alt"></i></td>
		`;

		const
			edit = this.container.querySelector('.edit'),
			delete_ = this.container.querySelector('.delete');

		if(user.privileges.has('category.update')) {
			edit.on('click', () => this.edit());
			edit.classList.add('green');
		}

		else edit.classList.add('grey');

		if(user.privileges.has('category.delete')) {
			delete_.on('click', () => this.delete());
			delete_.classList.add('red');
		}

		else {
			delete_.classList.add('grey');
		}

		return this.container;
	}
}

class ExecutingReport {

	constructor(report, reports) {

		Object.assign(this, report);

		this.reports = reports;
	}

	get row() {

		const tr = document.createElement('tr');

		tr.innerHTML = `
			<td>${this.account.name} <span class="grey">#${this.account.id}</span></td>
			<td>${this.query.id}</td>
			<td class="query-name">${this.query.name}</td>
			<td class="user-name">${this.user.name}</td>
			<td>${this.params.type} <span class="grey">#${this.params.request[2]}</span> </td>
			<td>${Format.ago(this.execution_timestamp)}</td>
		`;

		tr.querySelector('.user-name').on('click', e => {

			e.stopPropagation();

			window.location = `/user/profile/${this.user.id}`;
		});

		tr.querySelector('.query-name').on('click', e => {

			e.stopPropagation();

			window.location = `/report/${this.query.id}`;
		});

		tr.on('click', () => {

			if(!ExecutingReport.queryDialog) {
				ExecutingReport.queryDialog = new DialogBox();
			}

			ExecutingReport.queryDialog.heading = this.query.name;

			const
				editor = new CodeEditor({mode: 'sql'});

			editor.editor.setTheme('ace/theme/clouds');
			editor.editor.setReadOnly(true);

			editor.value = this.params.request[0];

			ExecutingReport.queryDialog.body.classList.add('executing-query-info');

			ExecutingReport.queryDialog.body.innerHTML = `<h3>Query:</h3>`;

			ExecutingReport.queryDialog.body.appendChild(editor.container);

			ExecutingReport.queryDialog.show();
		});

		return tr;
	}
}

class CachedReport {

	constructor(report) {

		Object.assign(this, report);
	}

	get row() {

		if(this.rowElement) {
			return this.rowElement;
		}

		this.rowElement = document.createElement('tr');
		this.rowElement.innerHTML = `
			<td>${this.report_id}</td>
			<td data-sort-by = ${this.size}>${Format.number(this.size)}</td>
			<td title="${Format.dateTime(this.created_at)}">${Format.ago(this.created_at)}</td>
		`;

		return this.rowElement;
	}
}

class Alert {

	constructor(alertProperties) {

		Object.assign(this, alertProperties);
	}

	async load() {

		this.response = await API.call(this.api);

		this.render();
	}

	get container() {

		if(this.alertContainer) {

			return this.alertContainer;
		}

		const container = this.alertContainer = document.createElement('div');
		container.classList.add('alert');

		container.innerHTML = `
			<h2>
				<span class="arrow"><i class="fas fa-angle-right"></i></span>
				<span>${this.name}</span>
			</h2>
			<div class="alert-data hidden"></div>
		`;

		container.querySelector('h2').on('click', async () => {

			container.querySelector('.arrow').classList.toggle('rotate');

			if(!this.response) {

				await this.load();
			}

			container.querySelector('.alert-data').classList.toggle('hidden');
		});

		return container;
	}

	resetContainer() {

		this.container.querySelector('.arrow').classList.remove('rotate');
		this.container.querySelector('.alert-data').classList.add('hidden');
	}

	render() {

		const alertData = this.container.querySelector('.alert-data');

		if(!this.response.length) {

			return alertData.innerHTML = '<div class="NA">No data found</div>';
		}

		alertData.textContent = null;

		const table = document.createElement('table');

		table.innerHTML = `
			<thead>
				<tr></tr>
			</thead>
			<tbody></tbody>
		`;

		const
			thead = table.querySelector('thead > tr'),
			tbody = table.querySelector('tbody');


		for(const row of Object.keys(this.response[0])) {

			const th = document.createElement('th');

			th.innerHTML = row.split('_').map(x => x.slice(0, 1).toUpperCase() + x.slice(1)).join(' ');
			thead.appendChild(th);
		}

		for(const row of this.response) {

			const tr = document.createElement('tr');

			for(const column of Object.values(row)) {

				const td = document.createElement('td');

				td.innerHTML = column;
				tr.appendChild(td);
			}

			tbody.appendChild(tr);
		}

		(new SortTable({table})).sort();

		alertData.appendChild(table);
	}
}