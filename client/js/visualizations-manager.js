Page.class = class extends Page {

	constructor() {

		super();

		this.visualizationsManager = new VisualizationsManager(this);
		this.preview = new PreviewTabsManager(this);

		window.on('popstate', () => {

			const id = parseFloat(window.location.pathname.split('/').pop());

			if(window.location.pathname.includes('/visualizations-manager/configure/') && this.visualizationsManager.has(id)) {
				this.visualizationsManager.get(id).configure();
			} else {
				Sections.show('list');
			}
		});

		this.visualizationsManager.load();
	}
}

class VisualizationsManager extends Map {

	constructor(page) {

		super();

		this.page = page;

		this.connections = new Map;

		const filters = [
			{
				key: 'Visualization Name',
				rowValue: row => row.name ? [row.name] : [],
			},
			{
				key: 'Visualization ID',
				rowValue: row => [row.id],
			},
			{
				key: 'Visualization Type',
				rowValue: row => MetaData.visualizations.has(row.type) ? [MetaData.visualizations.get(row.type).name] : [],
			},
			{
				key: 'Visualization Tags',
				rowValue: row => row.tags ? row.tags.split(',').map(t => t.trim()) : [],
			},
			{
				key: 'Visualization Created By',
				rowValue: row => row.added_by_name ? [row.added_by_name] : [],
			},
			{
				key: 'Report Name',
				rowValue: row => row.report.name ? [row.report.name] : [],
			},
			{
				key: 'Report ID',
				rowValue: row => [row.report.id],
			},
			{
				key: 'Report Description',
				rowValue: row => row.report.description ? [row.report.description] : [],
			},
			{
				key: 'Report Created By',
				rowValue: row =>  row.report.added_by_name ? [row.report.added_by_name] : [],
			},
			{
				key: 'Report Tags',
				rowValue: row => row.report.tags ? row.report.tags.split(',').map(t => t.trim()) : [],
			},
			{
				key: 'Report Connection Name',
				rowValue: row => row.connection ? [row.connection.connection_name] : [],
			},
			{
				key: 'Report Connection Type',
				rowValue: row => row.connection && row.connection.datasource ? [row.connection.datasource.name] : [],
			},
			{
				key: 'Report Connection ID',
				rowValue: row => row.connection ? [row.connection.id] : [],
			},
		];

		this.search = new SearchColumnFilters({filters});
		this.search.on('change', () => this.render());

		this.page.container.appendChild(this.container);

		this.insertVisualizationReport = new MultiSelect({multiple: false});
	}

	async load() {

		const [_, connections] = await this.fetch();

		this.process(connections);
		this.render();

		const id = parseFloat(window.location.pathname.split('/').pop());

		if(window.location.pathname.includes('/visualizations-manager/configure/') && this.has(id)) {
			this.get(id).configure();
		}
	}

	async fetch() {

		return Promise.all([
			DataSource.load(true),
			API.call('credentials/list'),
		]);
	}

	process(connections) {

		// Load Connections
		{
			this.connections.clear();

			for(const connection of connections) {
				this.connections.set(connection.id, connection);
			}
		}

		this.clear();

		let reports = Array.from(DataSource.list.values());

		reports	= JSON.parse(JSON.stringify(reports))

		for(const report of reports) {

			// *_id is depreciated
			if('query_id' in report) {
				report.id = report.query_id;
				delete report.query_id;
			}

			for(const visualization of report.visualizations) {

				// *_id is depreciated
				if('visualization_id' in visualization) {
					visualization.id = visualization.visualization_id;
					delete visualization.visualization_id;
				}

				visualization.report = report;
				visualization.connection = this.connections.get(visualization.report.connection_name);

				if(visualization.connection) {
					visualization.connection.datasource = MetaData.datasources.get(visualization.connection.type);
				}

				this.set(visualization.id, new VisualizationsManagerRow(visualization, this))
			}
		}

		this.search.data = Array.from(this.values());
	}

	async render() {

		for(const section of this.page.container.querySelectorAll('.section.configuration')) {
			section.remove();
		}

		const tbody = this.container.querySelector('table tbody');

		tbody.textContent = null;

		for(const visualization of this.search.filterData) {
			tbody.appendChild(visualization.row);
		}

		if(!tbody.children.length) {
			tbody.innerHTML = '<tr><td colspan="7">No Visualizations Found!</td></tr>';
		}

		Sections.show('list');
	}

	/**
	 * Set the search interface to search a column for a specific value.
	 *
	 * @param string	column	The column to search in.
	 * @param string	query	The search query.
	 */
	searchColumn(column, query) {

		this.search.clear();

		const advanced = this.search.globalSearch.container.querySelector('.advanced');

		if(!advanced.classList.contains('selected')) {
			advanced.click();
		}

		const filter = new SearchColumnFilter(this.search);

		this.search.add(filter);

		this.search.render();

		filter.json = {
			searchQuery: query,
			searchValue: column,
			searchType: 'equalto',
		};

		this.search.changed();
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('section');

		container.classList.add('section');
		container.id = 'list';

		container.innerHTML = `

			<h1>Visualizations Manager</h1>

			<div class="toolbar">
				<button type="button" class="add-visualization"><i class="fa fa-plus"></i> Add New Report</button>
			</div>

			<table class="block">
				<thead>
					<tr>
						<th>Visualization</th>
						<th>Report</th>
						<th>Connection</th>
						<th>Type</th>
						<th>Tags</th>
						<th>Added</th>
						<th class="action">Configure</th>
						<th class="action">Delete</th>
					</tr>
				</thead>
				<tbody></tbody>
			</table>
		`;

		container.querySelector('.add-visualization').on('click', () => this.add());
		container.querySelector('.toolbar').appendChild(this.search.globalSearch.container);

		container.insertBefore(this.search.container, container.querySelector('table'));

		return container;
	}

	async add() {

		this.page.container.appendChild(this.insertForm);
		Sections.show('insert-visualization');
	}

	get insertForm() {

		if(this.insertFormContainer) {
			return this.insertFormContainer;
		}

		const container = this.insertFormContainer = document.createElement('section');

		container.classList.add('section');
		container.id = 'insert-visualization';

		container.innerHTML = `

			<h1>Add New Visualization</h1>

			<div class="toolbar">
				<button type="button" class="back"><i class="fas fa-arrow-left"></i> Back</button>
			</div>

			<form id="add-visualization-form" class="form">

				<div class="report">
					<label>
						<span>Report</span>
					</label>
				</div>
			</form>
		`;

		container.querySelector('.back').on('click', () => Sections.show('list'));

		{
			const datalist = [];

			for(const report of DataSource.list.values()) {

				datalist.push({
					name: report.name,
					value: report.query_id,
					subtitle: '#' + report.query_id,
				});
			}

			this.insertVisualizationReport.datalist = datalist;
			this.insertVisualizationReport.render();

			container.querySelector('label').appendChild(this.insertVisualizationReport.container);
		}

		const form = container.querySelector('form');

		for(const visualization of MetaData.visualizations.values()) {

			const label = document.createElement('label');
			label.name = visualization.name;

			label.innerHTML = `
				<figure>
					<img alt="${visualization.name}">
					<span class="loader"><i class="fa fa-spinner fa-spin"></i></span>
					<span class="NA hidden">Preview not available!</span>
					<figcaption>${visualization.name}</figcaption>
				</figure>
			`;

			const
				img = label.querySelector('img'),
				loader = label.querySelector('.loader'),
				NA = label.querySelector('.NA');

			img.on('load', () => {
				img.classList.add('show');
				loader.classList.add('hidden');
			});

			img.on('error', () => {
				NA.classList.remove('hidden');
				loader.classList.add('hidden');
			});

			img.src = visualization.image;

			label.on('click', label.clickListener = () => this.insert(visualization));

			form.appendChild(label);
		}

		return container;
	}

	async insert(visualization) {

		const [report] = this.insertVisualizationReport.value;

		if(!report) {

			return new SnackBar({
				message: 'Report is Required!',
				type: 'warning',
			});
		}

		const
			parameters = {
				query_id: report,
				name: DataSource.list.get(parseInt(report)).name,
				type: visualization.slug,
			},
			options = {
				method: 'POST',
			};

		try {

			const response = await API.call('reports/visualizations/insert', parameters, options);

			await this.load();

			window.history.pushState({}, '', '/visualizations-manager/configure/' + response.insertId);
			this.get(response.insertId).configure();

			new SnackBar({
				message: `${visualization.name} Visualization Added`,
				subtitle: `${this.report.name} #${response.insertId}`,
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

class VisualizationsManagerRow {

	constructor(visualization, visualizations) {

		Object.assign(this, visualization);

		this.visualizations = visualizations;
		this.page = visualizations.page;

		// Temporary maps until classes are moved permanently
		{
			visualizations.report = visualization.report;
			this.visualizations.visualization = this;
			this.visualizations.dashboards = this.dashboards;
			this.visualization_id = this.id;
		}

		this.manager = new VisualizationManager(this, visualizations);
		this.dashboards = new ReportVisualizationDashboards(visualizations);
	}

	get row() {

		if(this.rowElement) {
			return this.rowElement;
		}

		const
			container = this.rowElement = document.createElement('tr'),
			connectionName = this.connection ? this.connection.connection_name : '',
			connectionType = this.connection && this.connection.datasource ? this.connection.datasource.name : '',
			visualizationType = MetaData.visualizations.has(this.type) ? MetaData.visualizations.get(this.type).name : '';

		container.innerHTML = `

			<td class="name">
				<a href="/visualization/${this.id}" target="_blank">${this.name}</a>
				<span class="NA">#${this.id}</span>
			</td>

			<td class="report">
				<a href="/report/${this.report.id}" target="_blank">${this.report.name}</a>
				<span class="NA search-text" title="See all visualizations of this report">
					#${this.report.id}
				</span>
			</td>

			<td class="connection">

				<span class="name search-text" title="See all visualizations that use ${connectionName}">
					${connectionName || '<span class="NA">Invalid Connection</span>'}
				</span>

				&middot;

				<span class="type search-text" title="See all visualizations that use a ${connectionType} type connection">
					${connectionType || `<span class="NA">Invalid Datasource: ${this.connection ? this.connection.type : ''}</span>`}
				</span>

				<span class="NA">#${this.connection.id}</span>
			</td>

			<td class="type">
				<span class="search-text" title="See all ${visualizationType} type visualizations">
					${visualizationType ||  `<span class="NA">Invalid Type: ${this.type}</span>`}
				</span>
			</td>

			<td class="tags"></td>
			<td>
				<span title="${Format.dateTime(this.created_at)}">${Format.ago(this.created_at)}</span> by
				${this.added_by_name ? `<a href="/user/profile/${this.added_by}" target="_blank">${this.added_by_name}</a>` : 'Unknown User'}
			</td>
			<td class="action green configure">Configure</td>
			<td class="action red delete">Delete</td>
		`;

		container.querySelector('.tags').appendChild(this.tagsList);

		container.querySelector('td.report .search-text').on('click', () => {
			this.visualizations.searchColumn('Report ID', this.report.id);
		});

		container.querySelector('td.type .search-text').on('click', () => {
			this.visualizations.searchColumn('Visualization Type', visualizationType);
		});

		container.querySelector('td.connection .name').on('click', () => {
			this.visualizations.searchColumn('Report Connection ID', this.connection.id);
		});

		container.querySelector('td.connection .type').on('click', () => {
			this.visualizations.searchColumn('Report Connection Type', connectionType);
		});

		container.querySelector('td.configure').on('click', () => {

			window.history.pushState({}, '', '/visualizations-manager/configure/' + this.id);

			this.configure();
		});

		container.querySelector('td.delete').on('click', () => this.delete());

		return container;
	}

	get tagsList() {

		const container = document.createDocumentFragment();

		let tags = [];

		if(this.tags) {
			tags = this.tags.split(',').map(tag => tag.trim());
		}

		for(const tag of tags) {

			const tagContainer = document.createElement('span');

			tagContainer.classList.add('tag');

			tagContainer.textContent = tag;

			tagContainer.on('click', () => this.visualizations.searchColumn('Visualization Tags', tag));

			container.appendChild(tagContainer);
		}

		return container;
	}

	get configuration() {

		if(this.configurationElement) {
			return this.configurationElement;
		}

		const container = this.configurationElement = document.createElement('section');

		container.classList.add('section', 'configuration');
		container.id = 'configuration-' + this.id;

		container.innerHTML = `
			<h1>Configure ${this.name} <span class="NA">#${this.id}</span></h1>
			<div class="toolbar">
				<button type="button" class="back"><i class="fa fa-arrow-left"></i> Back</button>
				<button type="submit" class="save"><i class="far fa-save"></i> Save</button>
				<button type="button" class="preview"><i class="fa fa-eye"></i> Preview</button>
			</div>
		`;

		container.querySelector('.back').on('click', () => {

			if(window.history.state) {
				window.history.back();
				return;
			}

			history.pushState({}, '', '/visualizations-manager');
			Sections.show('list');
		});

		container.querySelector('.preview').on('click', () => this.manager.preview());
		container.querySelector('.save').on('click', () => this.update());

		container.appendChild(this.manager.container);
		container.querySelector('.visualization-form').insertBefore(this.dashboards.container, container.querySelector('.visualization-form .filters'));

		this.loadShare();

		return container;
	}

	async configure() {

		this.visualizations.container.parentElement.appendChild(this.configuration);

		this.configuration.appendChild(this.page.preview.container);

		Sections.show('configuration-' + this.id);

		if(!this.page.preview.report || this.page.preview.report.visualizations.selected.visualization_id != this.id) {

			await this.page.preview.loadTab({
				query_id: this.report.id,
				visualization: {
					id: this.id
				},
				tab: 'current',
				position: 'right',
			});
		}

		this.dashboards.load();
		this.manager.load();

		this.loadShare();
	}

	async loadShare() {

		if(!account.settings.get('visualization_roles_from_query')) {
			return;
		}

		const allowedTargets = ['role'];

		if(this.page.user.privileges.has('user.list') || this.page.user.privileges.has('report')) {
			allowedTargets.push('user');
		}

		const objectRoles = new ObjectRoles('visualization', this.visualization.visualization_id, allowedTargets);

		await objectRoles.load();

		const objectRolesContainer = document.createElement('div');

		objectRolesContainer.classList.add('configuration-section');

		objectRolesContainer.innerHTML = `
			<h3>
				<i class="fas fa-angle-right"></i>
				<i class="fas fa-angle-down hidden"></i>
				Share <span class="count"></span>
			</h3>
			<div id="share-visualization" class="hidden"></div>
		`;

		const h3 = objectRolesContainer.querySelector('h3');

		h3.on('click', () => {
			objectRolesContainer.querySelector('#share-visualization').classList.toggle('hidden');
			objectRolesContainer.querySelector('.fa-angle-right').classList.toggle('hidden');
			objectRolesContainer.querySelector('.fa-angle-down').classList.toggle('hidden');
		});

		objectRolesContainer.querySelector('#share-visualization').appendChild(objectRoles.container);
		this.configuration.querySelector('.visualization-form').appendChild(objectRolesContainer);
	}

	async update() {

		this.manager.form.tags.value = this.manager.form.tags.value.split(',').map(t => t.trim()).filter(t => t).join(', ');

		const
			parameters = {
				visualization_id: this.id,
				description: this.manager.descriptionEditor.value,
			},
			options = {
				method: 'POST',
				form: new FormData(this.manager.form),
			};

		options.form.set('options', JSON.stringify(this.manager.json.options));

		try {

			await API.call('reports/visualizations/update', parameters, options);

			await this.visualizations.load();

			await this.page.preview.loadTab({
				query_id: this.report.id,
				visualization: {
					id: this.id
				},
				tab: 'current',
				position: 'right',
			});

			const type = MetaData.visualizations.get(this.type);

			new SnackBar({
				message: `${type ? type.name : ''} Visualization Saved`,
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

		if(!confirm('Are you sure?')) {
			return;
		}

		const
			parameters = {
				visualization_id: this.id,
			},
			options = {
				method: 'POST',
			};

		try {

			const response = await API.call('reports/visualizations/delete', parameters, options);

			await this.visualizations.load();

			const type = MetaData.visualizations.get(this.type);

			new SnackBar({
				message: `${type ? type.name : ''} Visualization Deleted`,
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
}