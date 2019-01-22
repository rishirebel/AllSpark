class Connections extends Page {

	constructor() {

		super();

		window.on('popstate', e => this.loadState(e.state));

		this.container.querySelector('section#form .toolbar #back').on('click', () => this.back());

		this.container.querySelector('#add-oauth-connection').on('submit', e => OAuthConnection.insert(e));
		OAuthConnection.validate();

		(async () => {

			await this.load();

			this.loadState();
		})();
	}

	async loadState(state) {

		let what = state ? state.what : location.pathname.split('/');

		if(what[what.length - 2] == 'add') {

			DataConnection.types.get(what[what.length - 1]).render(this);
			this.dataConnections.get(what[what.length - 1]).addConnection();

			return Sections.show('form');

		}

		what = what.pop();

		for(const connections of this.dataConnections.values()) {

			for(const connection of connections) {
				if(connection.id == parseInt(what)) {
					return connection.edit();
				}
			}
		}

		await Sections.show('list');
	}

	async back() {

		if(history.state) {
			return history.back();
		}

		await Sections.show('list');

		history.pushState(null, '', `/connections-manager`);
	}

	async load() {

		const responses = await this.fetch();

		this.process(responses);

		this.render();
	}

	async fetch() {

		return Promise.all([
			API.call('credentials/list'),
			API.call('oauth/providers/list'),
			API.call('oauth/connections/list'),
		]);
	}

	process(response) {

		this.dataConnections = new Map;
		this.oAuthProviders = new Map;
		this.oAuthConnections = new Map;

		const dataConnectionsList = {};

		Array.from(DataConnection.types.keys()).map(c => dataConnectionsList[c] = []);

		for(const connection of response[0]) {
			dataConnectionsList[connection.type].push(connection);
		}

		for(const connection in dataConnectionsList) {
			this.dataConnections.set(connection, new DataConnections(dataConnectionsList[connection], connection, this));
		}

		for(const provider of response[1] || []) {
			this.oAuthProviders.set(provider.provider_id, provider);
		}

		this.container.querySelector('.oauth-heading').classList.toggle('hidden', !this.oAuthProviders.size);

		this.container.querySelector('.oauth-connections').classList.toggle('hidden', !this.oAuthProviders.size);

		for(const connection of response[2] || []) {
			this.oAuthConnections.set(connection.id, new OAuthConnection(connection, this));
		}
	}

	render(list) {

		const container = this.connectionsContainer;

		const
			connContainer = container.querySelector('#data-connections'),
			oauthContainer = this.container.querySelector('.oauth-connections table tbody');

		connContainer.textContent = null;
		oauthContainer.textContent = null;

		const dataConnections = list || this.dataConnections;

		for(const connection of dataConnections.values()) {
			connContainer.appendChild(connection.container);
		}

		for(const oauth of this.oAuthConnections.values()) {
			oauthContainer.appendChild(oauth.row);
		}

		if(!connContainer.childElementCount)
			connContainer.innerHTML = '<div class="NA">No Connection Found</div>';

        this.container.querySelector('section#list').insertBefore(container, this.container.querySelector('h1'))

		const providerList = this.container.querySelector('#add-oauth-connection').provider;
		providerList.textContent = null;

		for(const provider of this.oAuthProviders.values()) {
			providerList.insertAdjacentHTML('beforeend', `<option value="${provider.provider_id}">${provider.name}</option>`);
		}

		Sections.show('list');
	}

	get connectionsContainer() {

		if(this.connectionsContainerElement) {
			return this.connectionsContainerElement;
		}

		const container = this.connectionsContainerElement = document.createElement('div');
		container.classList.add('connections');

		container.innerHTML = `
			<div class="heading-bar">
				<span class="data-connection">Data Connections</span>
				<span class="oAuth-connection hidden">OAuth Connection</span>

				<div class="search-connections">
					<i class="fa fa-search"></i>
					<input autocomplete="off" type="search" placeholder="Search connections">
				</div>
			</div>

			<div id="data-connections"></div>

			<div class="hidden" id="oAuth-connections"></div>
		`;

		container.querySelector('.heading-bar .data-connection').on('click', () => {

		});

		container.querySelector('.heading-bar .oAuth-connection').on('click', () => {

		});

		const input = container.querySelector('.search-connections input');

		input.on('keyup', () => {
			this.search(input.value);
		});

		return container;
	}

	search(searchString) {

		if(!searchString)
			return this.render(this.dataConnections);

		const string = searchString.toLowerCase();

		const result = new Map;

		for(const [key,value] of this.dataConnections) {

			if(key.includes(string) || MetaData.datasources.get(key).name.toLowerCase().includes(string)) {
				result.set(key, value)
			}

			for(const data of value) {
				if(data.connection_name.toLowerCase().includes(string)) {
					result.set(key, value);
				}
			}
		}

		this.render(result);

		this.connectionsContainer.querySelector('.search-connections input').focus();
	}
}

Page.class = Connections;

class DataConnections extends Set {

	constructor(connections, type, page) {

		super();

		this.type = type;

		this.page = page;

		this.connectionsContainer = this.page.container.querySelector('section#form');

		this.form = this.connectionsContainer.querySelector('form');

		for(const connection of connections) {
			this.add(new DataConnection(connection, page));
		}
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const connection = MetaData.datasources.get(this.type);

		const container = this.containerElement = document.createElement('article');

		container.innerHTML = `
			<div class="article-toolbar">
				<button type="button" class="disable" id="add-new"><i class="fa fa-plus"></i></button>
				<span>&nbsp; ${connection.name}</span>
				<figure>
					<img alt="${connection.name}" src=${connection.image}>
				</figure>
			</div>
			<div class="row">
			</div>
		`;

		const row = container.querySelector('.row');

		for(const connection of this) {
			row.appendChild(connection.row)
		}

		if(!row.childElementCount) {
			row.innerHTML = '<div class="NA">No connection added</div>'
		}

		if(user.privileges.has('connection.insert')) {

			container.querySelector('#add-new').classList.remove('disable');

			container.querySelector('#add-new').on('click', () => {

				history.pushState({what: 'add'}, '', `/connections-manager/add/${connection.slug}`);

				DataConnection.types.get(connection.slug).render(this.page);

				this.addConnection();

				Sections.show('form');

			});
		}

		return container;
	}

	async addConnection() {

		this.page.container.querySelector('#share-connections').innerHTML = `<div class="NA">You can share the connection once you create one.</div>`;

		this.connectionsContainer.querySelector('.toolbar #test-connection').classList.add('hidden');
		this.connectionsContainer.querySelector('.test-result').classList.add('hidden');
		this.connectionsContainer.querySelector('h1').textContent = `Add New ${MetaData.datasources.get(this.type).name} Connection`;

		if(DataConnection.eventListener) {
			this.form.removeEventListener('submit', DataConnection.eventListener);
		}

		this.form.reset();

		this.form.on('submit', DataConnection.eventListener = async (e) => {

			e.preventDefault();
			await this.insert();
		});
	}

	async insert() {

		const
			parameters = {
				type: this.type,
			},
			options = {
				method: 'POST',
				form: new FormData(this.form),
			};

		try {

			const response = await API.call('credentials/insert', parameters, options);

			await this.page.load();

			const connections = this.page.dataConnections.get(this.type);

			let selectedConnection;

			for(const connection of connections) {

				if(connection.id == response.insertId) {
					selectedConnection = connection;
					selectedConnection.edit();
				}
			}

			if(await Storage.get('newUser')) {
				await UserOnboard.setup(true);
			}

			new SnackBar({
				message: `${this.type} Connection Added`,
				subtitle: `${selectedConnection.connection_name} #${selectedConnection.id}`,
				icon: 'fas fa-plus',
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

class DataConnection {

	constructor(connection, page) {

		Object.assign(this, connection);

		this.page = page;

		this.container = page.container.querySelector('section#form');

		this.form = this.container.querySelector('form');
		DataConnection.page = page;
	}

	get row() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');
		container.classList.add('connection');

		container.innerHTML = `
			<span>${this.connection_name} <span class="NA">#${this.id}</span> </span>
			<span title="${!this.editable ? 'Not enough privileges' : 'Edit'}" class="action ${!this.editable ? 'grey' : 'green'}"><i class="far fa-edit"></i></span>
			<span title="${!this.deletable ? 'Not enough privileges' : 'Delete'}" class="action ${!this.deletable ? 'grey' : 'red'}"><i class="far fa-trash-alt"></i></span>
		`;

		if(container.querySelector('.green')) {
			container.querySelector('.green').on('click', () => {

				history.pushState({what: this.id}, '', `/connections-manager/${this.id}`);

				this.edit();
			});
		}

		if(container.querySelector('.red')) {
			container.querySelector('.red').on('click', () => this.delete());
		}

		return container;
	}

	async edit() {

		this.container.querySelector('h1').textContent = 'Editing ' + this.connection_name;

		if(DataConnection.eventListener) {
			this.form.removeEventListener('submit', DataConnection.eventListener);
		}

		this.form.on('submit', DataConnection.eventListener = async e => {
			e.preventDefault();
			await this.update();
		});

		this.objectRoles = new ObjectRoles('connection', this.id, ['user', 'role']);

		await this.objectRoles.load();

		this.page.container.querySelector('#share-connections').innerHTML = null;

		this.page.container.querySelector('#share-connections').appendChild(this.objectRoles.container);

		this.container.querySelector('.test-result').classList.add('hidden');

		const test = this.container.querySelector('.toolbar #test-connection');

		test.classList.toggle('hidden', ['file', 'bigquery', 'api', 'bigquery_legacy'].includes(this.type));

		test.removeEventListener('click', DataConnection.test_listener);

		test.on('click', DataConnection.test_listener = async () => this.test());

		for(const key in this) {

			if(this.form.elements[key]) {
				this.form.elements[key].value = this[key];
			}
		}

		DataConnection.types.get(this.type).render(this);

		await Sections.show('form');
	}

	async test() {

		const
			options = {
				method: 'POST',
			},
			parameter = {
				id: this.id,
			};

		let response;
		try {
			response = await API.call('credentials/testConnections', parameter, options);
		}
		catch (e) {

			new SnackBar({
				message: 'Connection Failed',
				subtitle: e.message || JSON.stringify(e),
				type: 'error',
			});

			throw e;
		}

		if(response.status) {

			new SnackBar({
				message: 'Connection Successful',
			});
		}
		else {
			new SnackBar({
				message: 'Connection Failed',
				subtitle: JSON.stringify(response.message || response),
				type: 'error',
			});
		}
	}

	async update() {

		const
			parameters = {
				id: this.id,
			},
			options = {
				method: 'POST',
				form: new FormData(this.form),
			};

		try {

			await API.call('credentials/update', parameters, options);

			await this.page.load();
			await Sections.show('list');

			new SnackBar({
				message: `${this.type} Connection Saved`,
				subtitle: `${this.connection_name} #${this.id} (${this.type})`,
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

		Sections.show('form');
	}

	async delete() {

		if(!confirm('Are you sure?!'))
			return;

		const
			parameters = {
				id: this.id,
				type: this.type,
			},
			options = {
				method: 'POST',
			};

		try {

			await API.call('credentials/delete', parameters, options);

			await this.page.load();

			if(await Storage.get('newUser')) {
				await UserOnboard.setup(true);
			}

			new SnackBar({
				message: `${this.type} Connection Removed`,
				subtitle: `${this.connection_name} #${this.id}`,
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

DataConnection.types = new Map;

DataConnection.types.set('mysql', class {

	static async render(connections = {}) {

		connections.form =  connections.container.querySelector('#connections-form');
		connections.form.querySelector('#details').classList.remove('hidden');

		connections.form.querySelector('#details').innerHTML = `

			<label>
				<span>Username</span>
				<input autocomplete="off" type="text" name="user" value="${connections.user_name || ''}">
			</label>

			<label>
			<span class="password">Password <a class="right NA show-password" id="showpassword" data-tooltip="Show Password">Show</a></span></input>
				<input autocomplete="off" type="password" name="password" value="${connections.password || ''}">
			</label>

			<label>
				<span>Host</span>
				<input autocomplete="off" type="text" name="host" value="${connections.host || ''}">
			</label>

			<label>
				<span>Port</span>
				<input autocomplete="off" type="number" name="port" value="${connections.port || ''}" min="1" placeholder="3306" step="1" max="65536">
			</label>

			<label>
				<span>Database</span>
				<input autocomplete="off" type="text" name="db" value="${connections.db || ''}">
			</label>
		`;

		const togglePassword = connections.form.querySelector('#showpassword');

		togglePassword.on('click', () => {

			if(connections.form.password.value) {

				togglePassword.textContent = togglePassword.textContent == 'Show' ? 'Hide' : 'Show';
				togglePassword.dataset.tooltip = togglePassword.dataset.tooltip == 'Show Password' ? 'Hide Password' : 'Show Password';
				connections.form.password.type = connections.form.password.type == 'text' ? 'password': 'text';
			}
		});
	}

	static get details() {

		return JSON.stringify({
			user: connections.form.user.value,
			password: connections.form.password.value,
			host: connections.form.host.value,
			port: connections.form.port.value,
			db: connections.form.db.value,
		});
	}
});

DataConnection.types.set('mssql', class {

	static render(connections = {}) {

		connections.form = connections.container.querySelector('#connections-form');
		connections.form.querySelector('#details').classList.remove('hidden');

		connections.form.querySelector('#details').innerHTML = `

			<label>
				<span>Username</span>
				<input autocomplete="off" type="text" name="user" value="${connections.user_name || ''}">
			</label>

			<label>
			<span class="password">Password <a class="right NA show-password" id="showpassword" data-tooltip="Show Password">Show</a></span></input>
				<input autocomplete="off" type="password" name="password" value="${connections.password || ''}">
			</label>

			<label>
				<span>Host</span>
				<input autocomplete="off" type="text" name="host" value="${connections.host || ''}">
			</label>

			<label>
				<span>Port</span>
				<input autocomplete="off" type="number" name="port" value="${connections.port || ''}" min="1" step="1" max="65536">
			</label>

			<label>
				<span>Database</span>
				<input autocomplete="off" type="text" name="db" value="${connections.db || ''}">
			</label>
		`;

		const togglePassword = connections.form.querySelector('#showpassword');

		togglePassword.on('click', () => {

			if(connections.form.password.value) {

				togglePassword.textContent = togglePassword.textContent == 'Show' ? 'Hide' : 'Show';
				togglePassword.dataset.tooltip = togglePassword.dataset.tooltip == 'Show Password' ? 'Hide Password' : 'Show Password';
				connections.form.password.type = connections.form.password.type == 'text' ? 'password': 'text';
			}
		});
	}

	static get details() {

		return JSON.stringify({
			user: connections.form.user.value,
			password: connections.form.password.value,
			host: connections.form.host.value,
			port: connections.form.port.value,
			db: connections.form.db.value,
		});
	}
});

DataConnection.types.set('pgsql', class {

	static render(connections = {}) {

		connections.form = connections.container.querySelector('#connections-form');
		connections.form.querySelector('#details').classList.remove('hidden');

		connections.form.querySelector('#details').innerHTML = `

			<label>
				<span>Username</span>
				<input autocomplete="off" type="text" name="user" value="${connections.user_name || ''}">
			</label>

			<label>
			<span class="password">Password <a class="right NA show-password" id="showpassword" data-tooltip="Show Password">Show</a></span></input>
				<input autocomplete="off" type="password" name="password" value="${connections.password || ''}">
			</label>

			<label>
				<span>Host</span>
				<input autocomplete="off" type="text" name="host" value="${connections.host || ''}">
			</label>

			<label>
				<span>Port</span>
				<input autocomplete="off" type="number" name="port" value="${connections.port || ''}" min="1" step="1" max="65536">
			</label>

			<label>
				<span>Database</span>
				<input autocomplete="off" type="text" name="db" value="${connections.db || ''}">
			</label>
		`;

		const togglePassword = connections.form.querySelector('#showpassword');

		togglePassword.on('click', () => {

			if(connections.form.password.value) {

				togglePassword.textContent = togglePassword.textContent == 'Show' ? 'Hide' : 'Show';
				togglePassword.dataset.tooltip = togglePassword.dataset.tooltip == 'Show Password' ? 'Hide Password' : 'Show Password';
				connections.form.password.type = connections.form.password.type == 'text' ? 'password': 'text';
			}
		});
	}

	static get details() {

		return JSON.stringify({
			user: connections.form.user.value,
			password: connections.form.password.value,
			host: connections.form.host.value,
			port: connections.form.port.value,
			db: connections.form.db.value,
		});
	}
});

DataConnection.types.set('oracle', class {

	static render(connections = {}) {

		connections.form = connections.container.querySelector('#connections-form');
		connections.form.querySelector('#details').classList.remove('hidden');

		connections.form.querySelector('#details').innerHTML = `

			<label>
				<span>Username</span>
				<input autocomplete="off" type="text" name="user" value="${connections.user_name || ''}">
			</label>

			<label>
				<span class="password">Password <a class="right NA show-password" id="showpassword" data-tooltip="Show Password">Show</a></span>
				<input type="password" autocomplete="off" name="password" value="${connections.password || ''}">
			</label>

			<label>
				<span>Host</span>
				<input autocomplete="off" type="text" name="host" value="${connections.host || ''}">
			</label>

			<label>
				<span>Port</span>
				<input autocomplete="off" type="number" name="port" value="${connections.port || ''}" min="1" step="1" max="65536">
			</label>
		`;

		const togglePassword = connections.form.querySelector('#showpassword');

		togglePassword.on('click', () => {

			if(connections.form.password.value) {

				togglePassword.textContent = togglePassword.textContent == 'Show' ? 'Hide' : 'Show';
				togglePassword.dataset.tooltip = togglePassword.dataset.tooltip == 'Show Password' ? 'Hide Password' : 'Show Password';
				connections.form.password.type = connections.form.password.type == 'text' ? 'password': 'text';
			}
		});

	}

	static get details() {

		return JSON.stringify({
			user: connections.form.user.value,
			password: connections.form.password.value,
			host: connections.form.host.value,
			port: connections.form.port.value,
		});
	}
});

DataConnection.types.set('api', class {

	static render(connections = {}) {

		const connectionDetails = connections.container.querySelector('#connections-form #details');

		connectionDetails.innerHTML = null;
		connectionDetails.classList.add('hidden');

	}

	static get details() {
		return JSON.stringify({});
	}
});

DataConnection.types.set('bigquery', class {

	static render(connections = {}) {

		const connectionDetails = connections.container.querySelector('#connections-form #details');

		connectionDetails.innerHTML = null;
		connectionDetails.classList.add('hidden');
	}

	static get details() {
		return JSON.stringify({});
	}
});

DataConnection.types.set('bigquery_legacy', class {

	static render(connections = {}) {

		const connectionDetails = connections.container.querySelector('#connections-form #details');

		connectionDetails.innerHTML = null;
		connectionDetails.classList.add('hidden');
	}

	static get details() {
		return JSON.stringify({});
	}
});

DataConnection.types.set('file', class {

	static render(connections = {}) {

		const connectionDetails = connections.container.querySelector('#connections-form #details');

		connectionDetails.innerHTML = null;
		connectionDetails.classList.add('hidden');
	}

	static get details() {
		return JSON.stringify({});
	}
});

DataConnection.types.set('mongo', class {

	static render(connections = {}) {

		connections.form = connections.container.querySelector('#connections-form');
		connections.form.querySelector('#details').classList.remove('hidden');

		connections.form.querySelector('#details').innerHTML = `

			<label>
				<span>Username</span>
				<input autocomplete="off" type="text" name="user" value="${connections.user_name || ''}">
			</label>

			<label>
			<span class="password">Password <a class="right NA show-password" id="showpassword" data-tooltip="Show Password">Show</a></span></input>
				<input autocomplete="off" type="password" name="password" value="${connections.password || ''}">
			</label>

			<label>
				<span>Host</span>
				<input autocomplete="off" type="text" name="host" value="${connections.host || ''}">
			</label>

			<label>
				<span>Port</span>
				<input autocomplete="off" type="number" name="port" value="${connections.port || ''}" min="1" step="1" max="65536">
			</label>

			<label>
				<span>Database</span>
				<input autocomplete="off" type="text" name="db" value="${connections.db || ''}">
			</label>
		`;

		const togglePassword = connections.form.querySelector('#showpassword');

		togglePassword.on('click', () => {

			if(connections.form.password.value) {

				togglePassword.textContent = togglePassword.textContent == 'Show' ? 'Hide' : 'Show';
				togglePassword.dataset.tooltip = togglePassword.dataset.tooltip == 'Show Password' ? 'Hide Password' : 'Show Password';
				connections.form.password.type = connections.form.password.type == 'text' ? 'password': 'text';
			}
		});
	}

	static get details() {

		return JSON.stringify({
			user: connections.form.user.value,
			password: connections.form.password.value,
			host: connections.form.host.value,
			port: connections.form.port.value,
			db: connections.form.db.value,
		});
	}
});

class OAuthConnection {

 	static async validate() {

 		const search = new URLSearchParams(window.location.search);

 		if(!search.has('state'))
			return;

 		const
			parameters = {
				state: search.get('state'),
				code: search.get('code'),
			},
			options = {method: 'POST'};

 		if(search.get('error') == 'access_denied') {
			return;
 		}

 		try {
			await API.call('oauth/connections/redirect_uri', parameters, options);
		}
		catch(e) {
 			alert(e.message);
			return;
		}

 		window.location = '/connections-manager';
	}

 	static async insert(e) {

 		e.preventDefault();

 		const
			parameters = {
				provider_id: DataConnection.page.container.querySelector('#add-oauth-connection').provider.value,
			},
			options = {
				method: 'POST',
			};

 		await API.call('oauth/connections/insert', parameters, options);

 		DataConnection.page.load();
	}

 	constructor(connection, page) {

 		Object.assign(this, connection);
		this.page = page;
	}

 	get row() {

 		if(this.containerElement) {
			return this.containerElement;
 		}

 		const container = this.containerElement = document.createElement('tr');

 		container.innerHTML = `
			<td>${this.id}</td>
			<td>${this.page.oAuthProviders.get(this.provider_id).name}</td>
			<td>${this.page.oAuthProviders.get(this.provider_id).type}</td>
			<td class="action green authenticate">
				${(this.access_token || this.refresh_token) ? '<i class="fas fa-flask"></i>' : '<i class="fas fa-link"></i>'}
			</td>
			<td class="action red delete"><i class="far fa-trash-alt"></i></td>
		`;

 		container.querySelector('.authenticate').on('click', () => {

 			if(this.access_token || this.refresh_token) {
				this.test();
 			} else {
 				this.authenticate();
 			}
		});

 		container.querySelector('.delete').on('click', () => this.delete());

 		return container;
	}

 	async test() {

 		const
			parameters = {
				id: this.id
			},
			container = this.page.container.querySelector('.test-result');

 		let response;

 		try {
			response = await API.call('oauth/connections/test', parameters);
		}
		catch (e) {
 			container.classList.remove('hidden');
			container.classList.add('warning');
			container.classList.remove('notice');
			container.textContent = e.message || e;
			return;
		}

 		container.classList.remove('hidden');

 		if(response) {
			container.classList.add('notice');
			container.classList.remove('warning');
			container.textContent = 'Connection Successful';
		}
		else {
			container.classList.add('warning');
			container.classList.remove('notice');
			container.textContent = 'Connection Failed';
		}
	}

 	async authenticate() {

 		const provider = this.page.oAuthProviders.get(this.provider_id);

 		if(provider.name == 'Google Analytics') {
 			const parameters = new URLSearchParams();
 			parameters.set('client_id', provider.client_id);
			parameters.set('redirect_uri', `http://${window.location.host}/connections-manager`);
			parameters.set('scope', 'https://www.googleapis.com/auth/analytics.readonly');
			parameters.set('access_type', 'offline');
			parameters.set('response_type', 'code');
			parameters.set('state', this.id);
			parameters.set('login_hint', user.email);
 			window.open(`https://accounts.google.com/o/oauth2/v2/auth?` + parameters);
		}
 		else if(provider.name == 'Google AdWords') {
 			const parameters = new URLSearchParams();
 			parameters.set('client_id', provider.client_id);
			parameters.set('redirect_uri', `http://${window.location.host}/connections-manager`);
			parameters.set('scope', 'https://www.googleapis.com/auth/adwords');
			parameters.set('access_type', 'offline');
			parameters.set('response_type', 'code');
			parameters.set('state', this.id);
			parameters.set('login_hint', user.email);
 			window.open(`https://accounts.google.com/o/oauth2/v2/auth?` + parameters);
		}
 		else if(provider.name == 'Google BigQuery') {
 			const parameters = new URLSearchParams();
 			parameters.set('client_id', provider.client_id);
			parameters.set('redirect_uri', `https://${account.url}/connections-manager`);
			parameters.set('scope', 'https://www.googleapis.com/auth/bigquery');
			parameters.set('access_type', 'offline');
			parameters.set('response_type', 'code');
			parameters.set('state', this.id);
			parameters.set('login_hint', user.email);
 			window.open(`https://accounts.google.com/o/oauth2/v2/auth?` + parameters);
		}
 		else if(provider.name == 'Facebook Marketing') {
 			const parameters = new URLSearchParams();
 			parameters.set('client_id', provider.client_id);
			parameters.set('redirect_uri', `https://${account.url}/connections-manager`);
			parameters.set('scope', 'ads_read');
			parameters.set('response_type', 'code');
			parameters.set('state', this.id);
 			window.open(`https://www.facebook.com/v3.0/dialog/oauth?` + parameters);
		}
	}

 	async delete() {

 		if(!confirm('Are you sure?! This will not delete the stored data.')) {
			return;
 		}

 		const
			parameters = { id: this.id },
			options = { method: 'POST' };

 		await API.call('oauth/connections/delete', parameters, options);
 		this.page.load();
	}
}

