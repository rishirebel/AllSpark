Page.class = class extends Page {

	constructor() {

		super();

		this.visualizationsManager = new VisualizationsManager(this);

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
				rowValue: row => [row.connection_name],
			},
		];

		this.search = new SearchColumnFilters({filters});
		this.search.on('change', () => this.render());

		this.page.container.appendChild(this.container);
	}

	async load() {

		const [_, connections] = await this.fetch();

		this.process(connections);
		this.render();
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

		for(const report of DataSource.list.values()) {

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

				this.set(visualization.id, new VisualizationsManagerRow(visualization))
			}
		}

		this.search.data = Array.from(this.values());
	}

	async render() {

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
				<button><i class="fa fa-plus"></i> Add New Report</button>
			</div>

			<table class="block">
				<thead>
					<tr>
						<th>Visualization</th>
						<th>Report</th>
						<th>Connection</th>
						<th>Type</th>
						<th>Tags</th>
						<th class="action">Configure</th>
						<th class="action">Delete</th>
					</tr>
				</thead>
				<tbody></tbody>
			</table>
		`;

		container.querySelector('.toolbar').appendChild(this.search.globalSearch.container);

		container.insertBefore(this.search.container, container.querySelector('table'));

		return container;
	}
}

class VisualizationsManagerRow {

	constructor(visualization) {
		Object.assign(this, visualization);
	}

	get row() {

		if(this.rowElement) {
			return this.rowElement;
		}

		const container = this.rowElement = document.createElement('tr');

		container.innerHTML = `

			<td class="name">
				<a href="/visualization/${this.id}" target="_blank">${this.name}</a>
				<span class="NA id">#${this.id}</span>
			</td>

			<td>
				<a href="/report/${this.report.id}" target="_blank">${this.report.name}</a>
				<span class="NA id">#${this.report.id}</span>
			</td>

			<td>
				${this.connection ? this.connection.connection_name : '<span class="NA">Invalid Connection</span>'}
				(${this.connection && this.connection.datasource ? this.connection.datasource.name : `<span class="NA">Invalid Datasource: ${this.connection ? this.connection.type : ''}</span>`})
				<span class="NA id">#${this.connection.id}</span>
			</td>

			<td class="type">
				${MetaData.visualizations.has(this.type) ? MetaData.visualizations.get(this.type).name : `<span class="NA">Invalid Type: ${this.type}</span>`}
			</td>

			<td class="tags"></td>
			<td class="action green">Configure</td>
			<td class="action red">Delete</td>
		`;

		container.querySelector('.tags').appendChild(this.tagsList);

		container.querySelector('.type').on('click', ()=> {

			this.search.clear();

			this.search.add()

		});

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

			tagContainer.on('click', () => {});

			container.appendChild(tagContainer);
		}

		return container;
	}
}