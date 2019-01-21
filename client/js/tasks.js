Page.class = class Tasks extends Page {

	constructor() {

		super();

		this.list = new Map;
		this.oauth = {
			providers: new Map,
			connections: new Map,
		};

		window.on('popstate', e => this.loadState(e.state));

		Task.setup(this);

		(async () => {

			await this.load();

			this.loadState();
		})();
	}

	async loadState(state) {

		const what = state ? state.what : location.pathname.split('/').pop();

		if(what == 'add') {
			return Task.add(this);
		}

		if(what == 'define') {

			const id = parseInt(location.pathname.split('/')[location.pathname.split('/').length - 2]);

			if(this.list.has(id)) {
				return this.list.get(id).define();
			}
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

		history.pushState(null, '', `/tasks`);
	}

	async load() {

		const response = await this.fetch();

		this.process(response);

		this.render();
	}

	async fetch() {

		return Promise.all([
			API.call('tasks/list'),
			API.call('oauth/providers/list'),
			API.call('oauth/connections/list'),
		]);
	}

	process([tasks, providers, connections]) {

		if(!Array.isArray(tasks)) {
			throw Page.exception('Invalid task list response!');
		}

		this.list.clear();

		for(const task of tasks) {

			if(!Task.types.has(task.type)) {
				throw Page.exception('Invalid task type!');
			}

			this.list.set(task.id, new (Task.types.get(task.type))(task, this));
		}

		this.oauth.providers.clear();

		for(const provider of providers) {
			this.oauth.providers.set(provider.provider_id, provider);
		}

		this.oauth.connections.clear();

		for(const connection of connections) {
			this.oauth.connections.set(connection.id, connection);
		}
	}

	render() {

		const tbody = this.container.querySelector('section#list table tbody');

		tbody.textContent = null;

		for(const task of this.list.values()) {
			tbody.appendChild(task.row);
		}

		if(!tbody.children.length) {
			tbody.innerHTML = '<tr><td class="NA" colspan="6">No Tasks found!</td></tr>';
		}
	}
}

class Task {

	static setup(tasks) {

		tasks.container.querySelector('#add-task').on('click', () => {
			history.pushState({what: 'add'}, '', '/tasks/add');
			Task.add(tasks);
		});

		tasks.container.querySelector('#form-back').on('click', () => tasks.back());
		tasks.container.querySelector('#define-back').on('click', () => tasks.back());

		Task.form = tasks.container.querySelector('section#form form');
	}

	static async add(tasks) {

		Task.form.reset();

		tasks.container.querySelector('#form h1').textContent = 'Adding new Task';

		Task.form.removeEventListener('submit', Task.formListener);
		Task.form.on('submit', Task.formListener = e => {
			e.preventDefault();
			Task.insert(tasks);
		});

		await Sections.show('form');
	}

	static async insert(tasks) {

		const options = {
			method: 'POST',
			form: new FormData(Task.form),
		};

		const response = await API.call('tasks/insert', {}, options);

		await tasks.load();

		if(!tasks.list.has(response.insertId)) {
			throw new Page.exception('New task\'s id not found in task list!');
		}

		tasks.back();
	}

	constructor(task, tasks) {

		Object.assign(this, task);
		this.tasks = tasks;
	}

	async edit() {

		Task.form.reset();

		this.tasks.container.querySelector('#form h1').textContent = `Editing ${this.name}`;

		for(const element of Task.form.elements) {

			if(element.name in this) {
				element.value = this[element.name];
			}
		}

		Task.form.removeEventListener('submit', Task.formListener);
		Task.form.on('submit', Task.formListener = e => {
			e.preventDefault();
			this.update();
		});

		await Sections.show('form');
	}

	async update() {

		const
			parameters = {
				id: this.id,
			},
			options = {
				method: 'POST',
				form: new FormData(Task.form),
			};

		await API.call('tasks/update', parameters, options);

		await this.tasks.load();

		this.tasks.back();
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

		await API.call('tasks/delete', parameters, options);

		await this.tasks.load();
	}

	get row() {

		if(this.rowContainer) {
			return this.rowContainer;
		}

		const container = this.rowContainer = document.createElement('tr');

		container.innerHTML = `
			<td>${this.id}</td>
			<td>${this.name}</td>
			<td>${this.type}</td>
			<td class="action green define">Define</td>
			<td class="action green edit"><i class="far fa-edit"></i></td>
			<td class="action red"><i class="far fa-trash-alt"></i></td>
		`;

		container.querySelector('.define').on('click', () => {
			history.pushState({what: this.id}, '', `/tasks/${this.id}/define`);
			this.define();
		});
		container.querySelector('.edit').on('click', () => {
			history.pushState({what: this.id}, '', `/tasks/${this.id}`);
			this.edit();
		});
		container.querySelector('.red').on('click', () => this.delete());

		return container;
	}
}

Task.types = new Map;

Task.types.set('google-analytics', class GoogleAnalyticsTask extends Task {

	async define() {

		Task.form.removeEventListener('submit', Task.formListener);
		Task.form.on('submit', Task.formListener = e => {
			e.preventDefault();
			this.update();
		});

		const container = this.tasks.container.querySelector('section#define');

		if(container.querySelector('form')) {
			container.querySelector('form').remove();
		}

		container.appendChild(this.form);

		await this.loadMetadata();

		await Sections.show('define');
	}

	get form() {

		if(this.formElement) {
			return this.formElement;
		}

		const form = this.formElement = document.createElement('form');

		form.id = 'task-define';

		form.innerHTML = `

			<h3>Select A View</h3>

			<div class="form block">
				<label>
					<span>Connection</span>
					<select name="oauth_connection_id"></select>
				</label>
			</div>

			<h3>Select A View</h3>

			<div class="form block">
				<label>
					<span>View ID</span>
					<input type="text" name="view"
				</label>

				<label class="hidden">
					<span>Account</span>
					<select name="account"></select>
				</label>

				<label class="hidden">
					<span>Property</span>
					<select name="property"></select>
				</label>

				<label class="hidden">
					<span>View</span>
					<select name="view_"></select>
				</label>
			</div>

			<h3>Select Query Parameters</h3>

			<div class="form block">
				<label class="metrics">
					<span>Metrics</span>
				</label>

				<label class="dimensions">
					<span>Dimensions</span>
				</label>
			</div>
		`;

		for(const connection of this.tasks.oauth.connections.values()) {

			if(!this.tasks.oauth.providers.has(connection.provider_id)) {
				continue;
			}

			form.oauth_connection_id.insertAdjacentHTML('beforeend', `
				<option value="${connection.id}">${this.tasks.oauth.providers.get(connection.provider_id).name}</option>
			`);
		}

		if(this.details && parseInt(this.details.oauth_connection_id)) {
			form.oauth_connection_id.value = this.details.oauth_connection_id;
		}

		if(this.details) {
			form.view.value = this.details.view;
		}

		form.on('submit', e => {
			e.preventDefault();
			this.save();
		});

		return form;
	}

	async save() {

		const
			parameters = {
				id: this.id,
				name: this.name,
				type: this.type,
				details: JSON.stringify({
					oauth_connection_id: this.form.oauth_connection_id.value,
					account: this.form.account.value,
					property: this.form.property.value,
					view: this.form.view.value,
					metrics: this.metricsMultiSelect.value,
					dimensions: this.dimensionsMultiSelect.value,
				}),
			},
			options = {
				method: 'POST',
			};

		await API.call('tasks/update', parameters, options);

		await this.tasks.load();

		this.tasks.back();
	}

	async loadMetadata() {

		this.metricsMultiSelect = new MultiSelect({multiple: true, mode: 'stretch'});
		this.dimensionsMultiSelect = new MultiSelect({multiple: true, mode: 'stretch'});

		this.form.querySelector('.metrics').appendChild(this.metricsMultiSelect.container);
		this.form.querySelector('.dimensions').appendChild(this.dimensionsMultiSelect.container);

		if(this.metadata || !this.details || !parseInt(this.details.oauth_connection_id)) {
			return;
		}

		const parameters = {oauth_connection_id: this.details.oauth_connection_id};

		this.metadata = await API.call('oauth/google-analytics/metadata', parameters);

		this.metricsMultiSelect.datalist = this.metadata.metrics;
		this.metricsMultiSelect.render();
		this.metricsMultiSelect.value = this.details.metrics || [];

		this.dimensionsMultiSelect.datalist = this.metadata.dimensions;
		this.dimensionsMultiSelect.render();
		this.dimensionsMultiSelect.value = this.details.dimensions || [];
	}
});