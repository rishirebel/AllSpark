window.addEventListener('beforeunload', function (event) {

	event.preventDefault();

	if(this.page.stages.get('define-report').container.querySelector('button.not-saved'))
		event.returnValue = 'Sure';
});

Page.class = class VisualizationsManger extends Page {

	constructor(page, key) {

		super(page, key);

		this.preview = new VisualizationsMangerPreview(this);
		this.list = new Map;

		this.container.appendChild(this.section);

		this.load();
	}

	async load() {

		await DataSource.load(true);

		this.process();
		this.render();
	}

	process() {

		this.list.clear();

		for(const report of DataSource.list) {

			for(const visualization of report.visualizations) {
				this.set(visualization.visualization_id, new VisualizationManagerRow(visualization, this));
			}
		}

		const filters = [
			{
				key: 'Query ID',
				rowValue: row => [row.query_id],
			},
			{
				key: 'Name',
				rowValue: row => row.name ? [row.name] : [],
			},
			{
				key: 'Description',
				rowValue: row => row.description ? [row.description] : [],
			},
			{
				key: 'Created By',
				rowValue: row =>  row.added_by_name ? [row.added_by_name] : [],
			},
			{
				key: 'Connection Name',

				rowValue: row => {
					if(page.connections.has(parseInt(row.connection_name)))
						return [page.connections.get(parseInt(row.connection_name)).connection_name];
					else
						return [];
				},
			},
			{
				key: 'Connection Type',
				rowValue: row => {
					if(page.connections.has(parseInt(row.connection_name)))
						return [page.connections.get(parseInt(row.connection_name)).feature.name];
					else
						return [];
				},
			},
			{
				key: 'Filter Length',
				rowValue: row => [row.filters.length]
			},
			{
				key: 'Filter Name',
				rowValue: row => row.filters.map(f => f.name ? f.name : []),
			},
			{
				key: 'Filter Placeholder',
				rowValue: row => row.filters.map(f => f.placeholder ? f.placeholder : []),
			},
			{
				key: 'Visualization ID',
				rowValue: row => row.visualizations.map(f => f.visualization_id ? f.visualization_id : []),
			},
			{
				key: 'Visualization Name',
				rowValue: row => row.visualizations.map(f => f.name ? f.name : []),
			},
			{
				key: 'Visualization Type',
				rowValue: row => {
					return row.visualizations.map(f => f.type)
											 .map(m => MetaData.visualizations.has(m) ?
											 (MetaData.visualizations.get(m)).name : []);
				},
			},
			{
				key: 'Visualization Created By',
				rowValue: row => row.visualizations.map(f => f.added_by_name ? f.added_by_name : []),
			},
			{
				key: 'Visualization Length',
				rowValue: row => [row.visualizations.length],
			},
			{
				key: 'Report Enabled',
				rowValue: row => row.is_enabled ? ['yes'] : ['no'],
			},
			{
				key: 'Report Creation',
				rowValue: row => row.created_at ? [row.created_at] : [],
			},
			{
				key: 'Definition',
				rowValue: row => row.query ? [row.query] : [],
			},
			{
				key: 'Report Refresh Rate',
				rowValue: row => row.refresh_rate ? [row.refresh_rate] : [],
			},
			{
				key: 'Subtitle',
				rowValue: row => {
					if(MetaData.categories.has(parseInt(row.subtitle)))
						return [MetaData.categories.get(parseInt(row.subtitle)).name];
					else
						return [];
				},
			},
			{
				key: 'Report Last Updated At',
				rowValue: row => row.updated_at ? [row.updated_at] : [],
			}
		];

		this.searchBar = new SearchColumnFilters({
			data: Array.from(this.list.values()),
			filters: filters,
			advanceSearch: true,
			page,
		});

		this.searchBar.on('change', () => this.render());
	}

	async render() {


	}

	get section() {

		if(this.sectionElement) {
			return this.sectionElement;
		}

		const container = this.sectionElement = document.createElement('section');

		container.classList.add('section');
		container.id = 'list';

		container.innerHTML = `

			<div class="toolbar"></div>

			<table>
				<thead>
					<tr>
						<th>ID</th>
						<th>Name</th>
						<th>Report</th>
						<th>Type</th>
						<th>Connection</th>
						<th>Tags</th>
						<th class="action">Configure</th>
						<th class="action">Delete</th>
					</tr>
				</thead>
				<tbody></tbody>
			</table>
		`;

		container.appendChild(this.searchBar.container);

		container.querySelector('.toolbar').appendChild(this.searchBar.globalSearch.container);

		return container;
	}
}

class VisualizationsMangerPreview {

	constructor(page) {

		this.page = page;
		this.container = this.page.container.querySelector('#preview');

		this.position('right');
	}

	async load(options = {}) {

		this.container.textContent = null;
		this.container.classList.add('hidden');

		if(!DataSource.list.has(options.query_id))
			return this.report = false;

		this.report = JSON.parse(JSON.stringify(DataSource.list.get(options.query_id)));
		this.report.visualizations = this.report.visualizations.filter(f => options.visualization ? f.visualization_id == options.visualization.id : f.type == 'table');

		if(options.definition && options.definition != this.report.definition) {
			this.report.query = options.definition.query;
			this.report.definition = options.definition;
			this.report.definitionOverride = true;
		}

		if(options.visualizationOptions)
			this.report.visualizations[0].options = options.visualizationOptions;

		if(options.visualization && options.visualization.type)
			this.report.visualizations[0].type = options.visualization.type;

		if(options.visualization && options.visualization.name)
			this.report.visualizations[0].name = options.visualization.name;

		this.report = new DataSource(this.report);

		this.report.container;
		this.report.visualizations.selected.container.classList.toggle('unsaved', this.report.definitionOverride ? 1 : 0);

		this.container.appendChild(this.report.container);
		this.container.classList.remove('hidden');

		this.page.container.classList.add('preview-' + this._position);

		await this.report.visualizations.selected.load();

		this.move({render: false});

	}

	set hidden(hidden) {

		this.container.classList.toggle('hidden', hidden);
		this.move();
	}

	get hidden() {
		return this.container.classList.contains('hidden');
	}

	async position(position) {

		this._position = position;
		await this.move();
	}

	async move({render = true} = {}) {

		this.page.container.classList.remove('preview-top', 'preview-right', 'preview-bottom', 'preview-left');

		if(this.hidden || !this.report)
			return;

		this.page.container.classList.add('preview-' + this._position);

		if(render)
			await this.report.visualizations.selected.render({resize: true});
	}
}

VisualizationsManger.stages.set('pick-report', class PickReport extends VisualizationsMangerStage {

	constructor(page, key) {

		super(page, key);

		this.order = '1';
		this.title = 'Pick Visualization';
		this.description = 'Pick a Visualization';

		this.sort = {};

		this.prepareSearch();
	}

	get url() {
		return this.key;
	}

	select() {

		super.select();

		if(this.page.stages.get('define-report').container.querySelector('button.not-saved'))
			return;

		for(const stage of this.page.stages.values())
			stage.disabled = stage != this;

		this.page.preview.hidden = true;
	}

	prepareSearch() {

		const columns = this.container.querySelectorAll('table thead th');

		for(const column of columns) {

			if(column.classList.contains('sort')) {

				column.on('click', () => {

					this.sort = {
						column: column.dataset.key,
						order: !this.sort.order,
					};

					this.load();
				});
			}
		}
	}

	async load() {

		this.page.searchBar.data = Array.from(DataSource.list.values());

		this.page.stages.get('configure-visualization').lastSelectedVisualizationId = null;

		const tbody = this.container.querySelector('tbody');

		tbody.textContent = null;

		for(const report of this.reports) {

			const connection = this.page.connections.get(parseInt(report.connection_name));

			if(!connection)
				continue;

			const row = document.createElement('tr');

			row.innerHTML = `
				<td>${report.query_id}</td>
				<td>
					<a href="/report/${report.query_id}" target="_blank">
						${report.name}
					</a>
				</td>
				<td>${connection.connection_name} (${connection.feature.name})</td>
				<td class="tags"></td>
				<td title="${report.filters.map(f => f.name).join(', ')}" >
					${report.filters.length}
				</td>
				<td class="action visualizations green ${report.visualizations.length && report.visualizations.some(rv => rv.editable) ? 'clickable' : 'disabled'}" title="${report.visualizations.map(f => f.name).join(', ')}" >
					${report.visualizations.length}
				</td>
				<td>${report.is_enabled ? 'Yes' : 'No'}</td>
				<td title="${!report.editable ? 'Not enough privileges' : ''}" class="action configure ${!report.editable ? 'grey' : 'green'}">Configure</td>
				<td title="${!report.editable ? 'Not enough privileges' : ''}" class="action define ${!report.editable ? 'grey' : 'green'}">Define</td>
				<td title="${!report.deletable ? 'Not enough privileges' : ''}" class="action delete ${!report.deletable ? 'grey' : 'red'}">Delete</td>
			`;

			const
				tagsContainer = row.querySelector('.tags'),
				tags = report.tags ? report.tags.split(',').map(t => t.trim()).filter(t => t) : [];

			for(const tag of tags) {

				const a = document.createElement('a');

				a.textContent = tag;
				a.classList.add('tag');
				a.on('click', e => this.tagSearch(e));

				tagsContainer.appendChild(a);
			}

			if(row.querySelector('.configure.green')) {
				row.querySelector('.configure').on('click', () => {

					window.history.pushState({}, '', `/visualizations-manager/configure-report/${report.query_id}`);

					this.page.stages.get('pick-visualization').disabled = false;

					this.page.load();
				});
			}

			if(row.querySelector('.delete.red')) {
				row.querySelector('.delete').on('click', () => this.delete(report));
			}

			tbody.appendChild(row);
		}

		if(!tbody.children.length)
			tbody.innerHTML = `<tr class="NA"><td colspan="11">No Reports Found!</td></tr>`;

		this.switcher.querySelector('small').textContent = 'Pick a report';
	}

	tagSearch(e) {

		e.stopPropagation();

		const value = e.currentTarget.textContent;

		for(const filter of this.page.searchBar.values()) {

			const values = filter.json;

			if(values.functionName == 'equalto' && values.query == value && values.searchValue == 'Tags')
				return;
		}

		this.page.searchBar.container.classList.remove('hidden');

		const tagFilter = new SearchColumnFilter(this.page.searchBar);

		this.page.searchBar.add(tagFilter);

		this.page.searchBar.render();

		tagFilter.json = {
			searchQuery: value,
			searchValue: 'Tags',
			searchType: 'equalto',
		};

		this.load();
	}

	get reports() {

		let reports = this.page.searchBar.filterData;

		if(this.sort.column) {

			reports = reports.sort((a, b) => {

				a = a[this.sort.column] || '';
				b = b[this.sort.column] || '';

				if(typeof a == 'string')
					a = a.toUpperCase();
				else if(typeof b == 'string')
					b = b.toUpperCase();
				else if(a instanceof Array) {
					a = a.length;
					b = b.length;
				}

				let result = 0;

				if(a < b)
					result = -1;

				if(a > b)
					result = 1;

				if(this.sort.order)
					result *= -1;

				return result;
			});
		}

		return reports;
	}

	add() {

		window.history.pushState({}, '', `/visualizations-manager/configure-report/add`);

		this.page.stages.get('configure-report').disabled = false;

		this.page.load();
	}

	async delete(report) {

		if(!window.confirm('Are you sure?!'))
			return;

		const
			parameters = {
				query_id: report.query_id,
			},
			options = {
				method: 'POST',
			};

		try {

			await API.call('reports/report/delete', parameters, options);

			await DataSource.load(true);

			this.load();

			if(await Storage.get('newUser'))
				await UserOnboard.setup();

			new SnackBar({
				message: 'Report Deleted',
				subtitle: `${report.name} #${report.query_id}`,
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
});

VisualizationsManger.stages.set('configure-visualization', class ConfigureVisualization extends VisualizationsMangerStage {

	constructor(page, key) {

		super(page, key);

		this.order = '5';
		this.title = 'Configure Visualization';
		this.description = 'Define how the report is visualized';

		this.container.querySelector('#configure-visualization-back').on('click', () => {

			if(window.history.state) {
				window.history.back();
				return;
			}

			history.pushState({}, '', `/visualizations-manager/pick-visualization/${this.report.query_id}`);

			this.disabled = true;

			this.page.load();
		});

		this.container.querySelector('#preview-configure-visualization').on('click', () => {

			if(!this.visualizationManager)
				return;

			this.visualizationManager.preview();
		});

		const historyToggle = this.container.querySelector('#history-configure-visualization');

		historyToggle.on('click',async () => {

			historyToggle.classList.toggle('selected');
			this.visualizationLogs.toggle(historyToggle.classList.contains('selected'));

			this.page.container.classList.toggle('compact', historyToggle.classList.contains('selected'));

			if(historyToggle.classList.contains('selected') && !this.visualizationLogs.size)
				await this.visualizationLogs.load();

			await this.page.preview.load({
				query_id: this.report.query_id,
				visualization: {
					id: this.visualization.visualization_id
				},
			});
		});
	}

	get url() {
		return `${this.key}/${this.visualization ? this.visualization.visualization_id : ''}`;
	}

	async load() {

		this.report = this.selectedReport;

		if(!this.report)
			throw new Page.exception('Invalid Report ID');

		let visualization_id = window.location.pathname.split('/').pop();

		if(!window.location.pathname.includes('configure-visualization')) {

			if(!this.lastSelectedVisualizationId)
				return this.container.classList.add('hidden');

			visualization_id = this.lastSelectedVisualizationId;

			window.history.pushState({}, '', `/visualizations-manager/${this.url}`);
		}

		this.lastSelectedVisualizationId = visualization_id;

		[this.visualization] = this.report.visualizations.filter(v => v.visualization_id == window.location.pathname.split('/').pop());

		if(!this.visualization)
			return;

		if(await Storage.has('newUser')) {

			this.visualization.options = this.page.onboard.visualization.options;
			this.visualization.name = this.page.onboard.visualization.name;
			this.visualization.description = this.page.onboard.visualization.description;
		}

		if(this.container.querySelector('.query-history'))
			this.container.querySelector('.query-history').remove();

		if(this.container.querySelector('.visualization-form.stage-form'))
			this.container.querySelector('.visualization-form.stage-form').remove();

		if(this.container.querySelector('.configuration-section.dashboards'))
			this.container.querySelector('.configuration-section.dashboards').remove();

		await this.page.preview.load({
			query_id: this.report.query_id,
			visualization: {
				id: this.visualization.visualization_id
			},
		});

		await this.loadVisualizationForm();

		this.visualizationLogs = new ReportLogs(this.visualization, this, {class: VisualizationLog, name: 'visualization'});

		const visualizationLogsSelected = this.container.querySelector('#history-configure-visualization').classList.contains('selected')

		this.visualizationLogs.toggle(visualizationLogsSelected);

		if(visualizationLogsSelected)
			this.visualizationLogs.load();

		this.container.appendChild(this.visualizationLogs.container);

		this.page.stages.get('pick-report').switcher.querySelector('small').textContent = this.report.name + ` #${this.report.query_id}`;
	}

	async loadVisualizationForm(visualization) {

		if(visualization)
			this.visualization = visualization;

		if(!ConfigureVisualization.types.has(this.visualization.type))
			throw new Page.exception(`Unknown visualization type ${this.visualization.type}`);

		if(this.container.querySelector('.visualization-form.stage-form'))
			this.container.querySelector('.visualization-form.stage-form').remove();

		if(this.container.querySelector('.configuration-section.dashboards'))
			this.container.querySelector('.configuration-section.dashboards').remove();

		this.visualizationManager = new VisualizationManager(this.visualization, this);

		this.container.appendChild(this.visualizationManager.container);
		this.visualizationManager.container.classList.add('stage-form');

		this.dashboards = new ReportVisualizationDashboards(this);

		this.container.querySelector('.visualization-form.stage-form').insertBefore(this.dashboards.container, this.container.querySelector('.visualization-form.stage-form .filters'));

		this.dashboards.clear();
		await this.page.preview.position('right');

		this.dashboards.load();

		this.visualizationManager.load();

		if(!(account.settings.has('visualization_roles_from_query') && account.settings.get('visualization_roles_from_query'))) {

			(async () => {

				const allowedTargets = ['role'];

				if(page.user.privileges.has('user.list') || page.user.privileges.has('report'))
					allowedTargets.push('user');

				this.objectRoles = new ObjectRoles('visualization', this.visualization.visualization_id, allowedTargets);

				await this.objectRoles.load();

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

				objectRolesContainer.querySelector('#share-visualization').appendChild(this.objectRoles.container);
				this.container.querySelector('.visualization-form.stage-form').appendChild(objectRolesContainer);
			})();
		}
	}
});

class VisualizationManagerRow {

	constructor(visualization, page) {

		Object.assign(this, visualization);
		this.page = page;

		this.descriptionEditor = new HTMLEditor();

		if(!this.options) {

			this.options = {};
		}

		if(typeof this.options == 'string') {

			try {

				this.options = JSON.parse(this.options) || {};
			}
			catch(e) {

				this.options = {};
			}
		}
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization-form');

		container.innerHTML = `
			<form id="configure-visualization-form">

				<div class="configuration-section">
					<h3><i class="fas fa-angle-right"></i> General</h3>
					<div class="body">
						<div class="form subform">
							<label>
								<span>Name <span class="red">*</span></span>
								<input type="text" name="name" required>
							</label>

							<label>
								<span>Visualization Type <span class="red">*</span></span>
								<select name="type" required></select>
							</label>
						</div>
					</div>
				</div>

				<div class="configuration-section">
					<h3><i class="fas fa-angle-right"></i> Description</h3>
					<div class="body">
						<div class="form subform description"></div>
					</div>
				</div>

				<div class="options"></div>

			</form>
		`;

		this.form = container.querySelector('#configure-visualization-form');
		this.optionsForm = new (ConfigureVisualization.types.get(this.type))(this, this.stage.page, this.stage);

		this.transformations = new ReportTransformations(this, this.stage);
		this.reportVisualizationFilters =  new ReportVisualizationFilters(this, this.stage);
		this.relatedVisualizations  = new RelatedVisualizations(this.stage);

		container.appendChild(this.relatedVisualizations.container);
		container.appendChild(this.transformations.container);
		container.appendChild(this.reportVisualizationFilters.container);

		for(const visualization of MetaData.visualizations.values()) {

			this.form.type.insertAdjacentHTML('beforeend', `
				<option value="${visualization.slug}">${visualization.name}</option>
			`);
		}

		container.querySelector('.form.description').appendChild(this.descriptionEditor.container);

		this.form.on('submit', e => this.update(e));

		return container;
	}

	async load() {

		this.form.reset();

		this.relatedVisualizations.load();
		this.reportVisualizationFilters.load();

		this.transformations.load();
		this.container.querySelector('.options').appendChild(this.optionsForm.form);

		this.setupConfigurationSetions();

		const first = this.container.querySelector('.configuration-section');

		if(first && first.querySelector('.body.hidden'))
			first.querySelector('h3').click();

		this.form.name.value = this.name;
		this.form.type.value = this.type;

		(async () => {
			await this.descriptionEditor.setup();
			this.descriptionEditor.value = this.description || '';
		})();
	}

	async update(e) {

		if(e)
			e.preventDefault();

		const
			parameters = {
				visualization_id: this.visualization_id,
				description: this.descriptionEditor.value,
			},
			options = {
				method: 'POST',
				form: new FormData(this.form),
			};

		options.form.set('options', JSON.stringify(this.json.options));

		try {

			await API.call('reports/visualizations/update', parameters, options);

			await DataSource.load(true);

			this.stage.visualizationLogs.clear();

			this.stage.load();

			this.stage.page.stages.get('pick-visualization').switcher.querySelector('small').textContent = this.form.name.value;

			const type = MetaData.visualizations.get(this.type);

			new SnackBar({
				message: `${type ? type.name : ''} Visualization Saved`,
				subtitle: `${this.name} #${this.visualization_id}`,
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

	get json() {

		return {
			visualization_id: this.visualization_id,
			query_id: this.query_id,
			type: this.form.type.value,
			name: this.form.name.value,
			description: this.descriptionEditor.value,
			options: {
				...this.optionsForm.json,
				transformations: this.transformations.json,
				filters: this.reportVisualizationFilters.json
			}
		};
	}

	async preview() {

		this.stage.page.preview.load({
			query_id: this.query_id,
			visualizationOptions: this.json.options,
			visualization: {
				id: this.visualization_id,
				type: this.json.type,
				name: this.json.name
			}
		});

		new SnackBar({
			message: 'Preview Loaded',
			subtitle: 'Your changes are not saved yet, and will be lost if page is reloaded',
			icon: 'fas fa-eye',
		});
	}

	setupConfigurationSetions(container) {

		if(!container)
			container = this.container;

		for(const section of container.querySelectorAll('.configuration-section')) {

			const
				body = section.querySelector('.body'),
				h3 = section.querySelector('h3');

			body.classList.add('hidden');

			h3.removeEventListener('click', h3.clickListener);

			h3.on('click', h3.clickListener = e => {

				body.classList.toggle('hidden');

				for(const svg of h3.querySelectorAll('.fa-angle-right, .fa-angle-down'))
					svg.remove();

				h3.insertAdjacentHTML('afterbegin', body.classList.contains('hidden') ? '<i class="fas fa-angle-right"></i>' : '<i class="fas fa-angle-down"></i>');
			});
		}
	}
}

class VisualizationLog extends ReportLog {

	load() {

		const logInfo = this.logs.container.querySelector('.info');

		logInfo.classList.remove('hidden');
		this.logs.container.querySelector('.list').classList.add('hidden');

		logInfo.querySelector('.toolbar').innerHTML =  `
			<button class="back"><i class="fa fa-arrow-left"></i> Back to history</button>
			<button class="restore"><i class="fa fa-window-restore"></i> Restore</button>
			<button class="preview"><i class="fas fa-eye"></i> Preview</button>
			<span class="log-title">
				<a href="/user/profile/${this.user_id}" target="_blank">${this.user_name}</a> &#183; ${Format.dateTime(this.created_at)}
			</span>
		`;

		logInfo.querySelector('.toolbar').classList.add('visualization');

		logInfo.querySelector('.toolbar button.back').on('click', () => {

			this.logs.container.querySelector('.list').classList.remove('hidden');
			logInfo.classList.add('hidden');
		});

		logInfo.querySelector('.toolbar .restore').on('click', () => {

			if(this.logsVisualizationManager) {

				this.logs.page.loadVisualizationForm(this.logsVisualizationManager.json);
			}

			new SnackBar({
				message: this.owner_id + ' Visualization Restored',
				subtitle: 'The restored visualization is not saved yet and will be lost on page reload.',
				icon: 'fa fa-plus',
			});
		});

		logInfo.querySelector('.toolbar .preview').on('click', () => {

			if(this.logsVisualizationManager) {

				this.logsVisualizationManager.preview();
			}

		});

		const queryInfo = this.logs.container.querySelector('.info div.log-form');
		queryInfo.textContent =null;

		queryInfo.classList.remove('block');

		if(!this.logsVisualizationManager) {

			this.logsVisualizationManager = new VisualizationManagerRow(this.state, this.logs.page);
		}

		queryInfo.appendChild(this.logsVisualizationManager.container);

		this.logsVisualizationManager.load();
	}
}

class Axes extends Set {

	constructor(axes, stage, checkMultiple = true) {
		super();

		this.stage = stage;
		this.list = axes;
		this.checkMultiple = checkMultiple;
		this.clear();

		for(const axis of this.list || [])
			this.add(new Axis(axis, this));
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');

		container.classList.add('options', 'form', 'body', 'axes');

		this.render();

		return container;
	}

	render() {

		this.container.textContent = null;

		this.stage.formContainer.querySelector('.configuration-section .count').innerHTML = `${this.size ? this.size + ' axes added' : ''}`;

		for(const axis of this)
			this.container.appendChild(axis.container);

		if(!this.size)
			this.container.innerHTML = '<div class="NA">No axes added yet!</div>';

		this.container.insertAdjacentHTML('beforeend', `

			<div class="add-axis">
				<fieldset>
					<legend>Add Axis</legend>
					<div class="form">

						<label>
							<span>Position</span>
							<select name="position" value="${this.position}" required>
								<option value="bottom">Bottom</option>
								<option value="left">Left</option>
								<option value="right">Right</option>
							</select>
						</label>

						<label>
							<span>&nbsp;</span>
							<button type="button"><i class="fa fa-plus"></i> Add</button>
						</label>
					</div>
				</fieldset>
			</div>
		`);

		this.container.querySelector('.add-axis button[type=button]').on('click', e => this.insert(e));
	}

	get json() {

		const response = [];

		for(const axis of this.values())
			response.push(axis.json);

		return response;
	}

	restCheck(action) {

		for(const rest of this.container.querySelectorAll('.restCheck'))
			rest.classList.toggle('hidden', action);
	}

	insert(e) {

		e.preventDefault();

		const position = this.container.querySelector('.add-axis select').value;

		this.add(new Axis({position}, this));
		this.render();
	}
}

class Axis {

	constructor(axis, axes) {

		for(const key in axis)
			this[key] = axis[key]

		this.axes = axes;

		if(!this.columns)
			this.columns = [];
	}

	get container() {

		if(this.axisContainer)
			return this.axisContainer;

		const container = this.axisContainer = document.createElement('div');

		let datalist = [];

		container.classList.add('axis');

		for(const [key, column] of this.axes.stage.page.preview.report.columns)
			datalist.push({name: column.name, value: key});

		let usedColumns = [];

		for(const axis of this.axes) {

			if(axis.position == this.position)
				continue;

			usedColumns = usedColumns.concat(axis.columns.map(x => x.key));
		}

		for(const column of usedColumns)
			datalist = datalist.filter(x => !column.includes(x.value));

		this.position = this.position || 'top';

		container.multiSelectColumns = new MultiSelect({datalist, expand: true, multiple: this.position != 'bottom' && this.axes.checkMultiple});

		const axisColumn = container.multiSelectColumns.container;

		container.multiSelectColumns.value = this.columns ? this.columns.map(x => x.key) : [];

		container.innerHTML = `

			<fieldset>
				<legend>${this.position[0].toUpperCase() + this.position.slice(1)} Axis</legend>

				<div class="form">

					<label>
						<span>Label</span>
						<input type="text" name="label" value="${this.label || ''}">
					</label>

					<label class="axis-column">
						<span>Columns</span>
					</label>

					<label class="restCheck"><span><input type="checkbox" name="restcolumns" class="restcolumns" ${this.restcolumns ? 'checked' : ''}> Rest</span></label>

					<label>
						<span>Format</span>
						<select name="format">
							<option value="">None</option>
							<option value="s">SI</option>
						</select>
					</label>

					<label>
						<span>
							<input type="checkbox" name="axisShowValues"> Show Values
						</span>
					</label>

					<label>
						<button class="delete" type="button">
							<i class="far fa-trash-alt"></i> Delete
						</button>
					</label>
				</div>
			</fieldset>
		`;

		container.multiSelectColumns.on('change', () => {

			let usedColumns = [];
			const freeColumns = [];

			for(const axis of this.axes)
				usedColumns = usedColumns.concat(axis.container.multiSelectColumns.value);

			for(const axis of this.axes) {
				for(const item of axis.container.multiSelectColumns.datalist) {
					if(!freeColumns.some(c => c.value.includes(item.value)) && !usedColumns.includes(item.value))
						freeColumns.push(item);
				}
			}

			for(const axis of this.axes) {

				if(axis == this)
					continue;

				const selected = axis.container.multiSelectColumns.value;

				var newDataList = [];

				for(const data of axis.container.multiSelectColumns.datalist) {
					if(!usedColumns.includes(data.value) || selected.includes(data.value)) {
						newDataList.push(data);
					}
				}

				for(const value of freeColumns) {
					if(!newDataList.some(k => k.value.includes(value.value)))
						newDataList.push(value);
				}

				if(axis.container.multiSelectColumns.datalist.map(x => x.value).sort().join() == newDataList.map(x => x.value).sort().join())
					continue;

				axis.container.multiSelectColumns.datalist = newDataList;
				axis.container.multiSelectColumns.render();
			}
		});

		const restColumns = container.querySelector('.restcolumns');

		restColumns.on('change', () => {

			this.axes.restCheck(restColumns.checked);
			axisColumn.classList.toggle('hidden');

			if(restColumns.checked)
				container.querySelector('.restCheck').classList.remove('hidden');
		});

		if(this.restcolumns) {

			this.axes.restCheck(true);
			axisColumn.classList.add('hidden');
		}

		container.querySelector('.axis-column').appendChild(axisColumn);

		container.querySelector('select[name=format]').value = this.format || '';
		container.querySelector('input[name=axisShowValues]').checked = this.showValues;

		container.querySelector('.delete').on('click', () => {
			this.axes.delete(this);
			this.axes.render();
		});

		return container;
	}

	get json() {

		return {
			label: this.container.querySelector('input[name=label]').value,
			columns: this.container.multiSelectColumns.value.map(c => {return {key: c}}),
			restcolumns: this.container.querySelector('input[name=restcolumns]').checked,
			format: this.container.querySelector('select[name=format]').value,
			showValues: this.container.querySelector('input[name=axisShowValues]').checked,
			position: this.position,
		};
	}
}

class LinearAxes extends Set {

	constructor(axes = [], stage) {
		super();

		this.stage = stage;
		this.list = axes;
		this.clear();

		for(const axis of this.list)
			this.add(new LinearAxis(axis, this));
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');

		container.classList.add('options', 'form', 'body', 'axes');

		this.render();

		return container;
	}

	render() {

		this.container.textContent = null;

		this.stage.formContainer.querySelector('.configuration-section .count').innerHTML = `${this.size ? this.size + ' axes added' : ''}`;

		for(const axis of this)
			this.container.appendChild(axis.container);

		if(!this.size)
			this.container.innerHTML = '<div class="NA">No axes added yet!</div>';

		this.container.insertAdjacentHTML('beforeend', `

			<div class="add-axis">
				<fieldset>
					<legend>Add Axis</legend>
					<div class="form">

						<label>
							<span>Position</span>
							<select name="position" value="${this.position}" required>
								<option value="bottom">Bottom</option>
								<option value="left">Left</option>
								<!--<option value="top">Top</option>-->
								<option value="right">Right</option>
							</select>
						</label>

						<label>
							<span>&nbsp;</span>
							<button type="button"><i class="fa fa-plus"></i> Add</button>
						</label>
					</div>
				</fieldset>
			</div>
		`);

		this.container.querySelector('.add-axis button[type=button]').on('click', e => this.insert(e));
	}

	get json() {

		const response = [];

		for(const axis of this.values())
			response.push(axis.json);

		return response;
	}

	restCheck(action) {

		for(const rest of this.container.querySelectorAll('.restCheck'))
			rest.classList.toggle('hidden', action);
	}

	insert(e) {

		e.preventDefault();

		const
			position = this.container.querySelector('.add-axis select').value,
			axis = new LinearAxis({position}, this);

		// Open the newly added axis
		axis.container.querySelector('legend').click();

		this.add(axis);
		this.render();
	}
}

class LinearAxis {

	constructor(axis, axes) {

		for(const key in axis)
			this[key] = axis[key]

		this.axes = axes;

		if(!this.columns)
			this.columns = [];
	}

	get container() {

		if(this.axisContainer) {
			return this.axisContainer;
		}

		const container = this.axisContainer = document.createElement('div');

		let datalist = [];

		container.classList.add('axis');

		for(const [key, column] of this.axes.stage.page.preview.report.columns)
			datalist.push({name: column.name, value: key});

		let usedColumns = [];

		for(const axis of this.axes) {

			if(axis.position == this.position) {
				continue;
			}

			usedColumns = usedColumns.concat(axis.columns.map(x => x.key));
		}

		for(const column of usedColumns) {
			datalist = datalist.filter(x => !column.includes(x.value));
		}

		this.position = this.position || 'top';

		container.multiSelectColumns = new MultiSelect({datalist: datalist, expand: true});

		const axisColumn = container.multiSelectColumns.container;

		container.multiSelectColumns.value = this.columns ? this.columns.map(x => x.key) : [];

		container.innerHTML = `

			<fieldset>
				<legend class="interactive">
					${this.position[0].toUpperCase() + this.position.slice(1)} Axis
				</legend>

				<div class="ellipsis"><i class="fas fa-ellipsis-h"></i></div>

				<div class="form hidden">

					<label>
						<span>Type</span>
						<select name="axis-type">
							<option value=""></option>
							<option value="line">Line</option>
							<option value="bar">Bar</option>
							<option value="area">Area</option>
						</select>
					</label>

					<label>
						<span>Position</span>
						<select name="position">
							<option value="bottom">Bottom</option>
							<option value="left">Left</option>
							<!--<option value="top">Top</option>-->
							<option value="right">Right</option>
						</select>
					</label>

					<label>
						<span>Label</span>
						<input type="text" name="label" value="${this.label || ''}">
					</label>

					<label class="axis-column">
						<span>Columns</span>
					</label>

					<label class="restCheck"><span><input type="checkbox" name="restcolumns" class="restcolumns" ${this.restcolumns ? 'checked' : ''}> Rest</span></label>

					<label>
						<span>
							<input type="checkbox" name="axisStacked"> Stacked
						</span>
					</label>

					<div class="advanced-toggle"><i class="fa fa-angle-down"></i> &nbsp; Advanced &nbsp; <i class="fa fa-angle-down"></i></div>

					<label class="advanced hidden">
						<span>Format</span>
						<select name="format">
							<option value="">None</option>
							<option value="s">SI</option>
						</select>
					</label>

					<label class="advanced hidden">
						<span>Z Axis (Depth)</span>
						<input type="number" step="1" name="axisDepth" value="${this.depth || ''}">
					</label>

					<label class="advanced hidden">
						<span>Line Curve</span>
						<select name="curve">
							<option value="linear">Linear</option>
							<option value="step-before">Step Before</option>
							<option value="step-after">Step After</option>
							<option value="basis">Basis</option>
							<option value="basis-open">Basis Open</option>
							<option value="basis-closed">Basis Closed</option>
							<option value="bundle">Bundle</option>
							<option value="cardinal">Cardinal</option>
							<option value="cardinal-open">Cardinal Open</option>
							<option value="cardinal-closed">Cardinal Closed</option>
							<option value="monotone">Monotone</option>
						</select>
					</label>

					<label class="advanced hidden">
						<span>Line Thickness <span class="right" data-tooltip="Line Type Only.">?</span></span>
						<input type="number" step="0.1" name="axisLineThickness" value="${this.lineThickness || ''}">
					</label>

					<label class="advanced hidden">
						<span>Max Tick Length <span class="right" data-tooltip="Cut off axis tick values after given length.">?</span></span>
						<input type="number" step="1" min="0" name="maxTickLength" value="${this.maxTickLength || ''}">
					</label>

					<label class="advanced hidden">
						<span>
							<input type="checkbox" name="rotateTicks"> Rotate Ticks
						</span>
					</label>

					<label class="advanced hidden">
						<span>
							<input type="checkbox" name="contribution"> Contribution
						</span>
					</label>

					<label class="advanced hidden">
						<span>
							<input type="checkbox" name="axisShowValues"> Show Values
						</span>
					</label>

					<label class="advanced hidden">
						<span>
							<input type="checkbox" name="axisShowPoints"> Show Points
						</span>
					</label>

					<label class="advanced hidden">
						<span>
							<input type="checkbox" name="axisHideScale"> Hide Scale
						</span>
					</label>

					<label class="advanced hidden">
						<span>
							<input type="checkbox" name="axisHideScaleLines"> Hide Scale Lines
						</span>
					</label>

					<label class="advanced hidden">
						<span>
							<input type="checkbox" name="axisDontAnimate"> Don't Animate
						</span>
					</label>

					<label>
						<button class="delete" type="button">
							<i class="far fa-trash-alt"></i> Delete
						</button>
					</label>
				</div>
			</fieldset>
		`;

		container.querySelector('legend').on('click', () => {
			container.querySelector('.form').classList.toggle('hidden');
			container.querySelector('.ellipsis').classList.toggle('hidden');
		});

		container.querySelector('.ellipsis').on('click', () => {
			container.querySelector('.form').classList.toggle('hidden');
			container.querySelector('.ellipsis').classList.toggle('hidden');
		});

		container.querySelector('.advanced-toggle').on('click', () => {

			for(const elemen of container.querySelectorAll('.advanced')) {
				elemen.classList.toggle('hidden');
			}
		});

		container.multiSelectColumns.on('change', () => {

			let usedColumns = [];
			const freeColumns = [];

			for(const axis of this.axes) {
				usedColumns = usedColumns.concat(axis.container.multiSelectColumns.value);
			}

			for(const axis of this.axes) {
				for(const item of axis.container.multiSelectColumns.datalist) {
					if(!freeColumns.some(c => c.value.includes(item.value)) && !usedColumns.includes(item.value)) {
						freeColumns.push(item);
					}
				}
			}

			for(const axis of this.axes) {

				if(axis == this) {
					continue;
				}

				const selected = axis.container.multiSelectColumns.value;

				var newDataList = [];

				for(const data of axis.container.multiSelectColumns.datalist) {
					if(!usedColumns.includes(data.value) || selected.includes(data.value)) {
						newDataList.push(data);
					}
				}

				for(const value of freeColumns) {
					if(!newDataList.some(k => k.value.includes(value.value))) {
						newDataList.push(value);
					}
				}

				if(axis.container.multiSelectColumns.datalist.map(x => x.value).sort().join() == newDataList.map(x => x.value).sort().join()) {
					continue;
				}

				axis.container.multiSelectColumns.datalist = newDataList;
				axis.container.multiSelectColumns.render();
			}
		});

		const restColumns = container.querySelector('.restcolumns');

		restColumns.on('change', () => {

			this.axes.restCheck(restColumns.checked);
			axisColumn.classList.toggle('hidden');

			if(restColumns.checked) {
				container.querySelector('.restCheck').classList.remove('hidden');
			}
		});

		if(this.restcolumns) {

			this.axes.restCheck(true);
			axisColumn.classList.add('hidden');
		}

		container.querySelector('.axis-column').appendChild(axisColumn);

		container.querySelector('select[name=axis-type]').value = this.type;
		container.querySelector('select[name=position]').value = this.position;
		container.querySelector('select[name=format]').value = this.format || '';
		container.querySelector('select[name=curve]').value = this.curve || 'linear';
		container.querySelector('input[name=axisDepth]').value = this.depth;
		container.querySelector('input[name=axisLineThickness]').value = this.lineThickness;
		container.querySelector('input[name=axisStacked]').checked = this.stacked;
		container.querySelector('input[name=rotateTicks]').checked = this.rotateTicks;
		container.querySelector('input[name=contribution]').checked = this.contribution;
		container.querySelector('input[name=axisShowValues]').checked = this.showValues;
		container.querySelector('input[name=axisShowPoints]').checked = this.showPoints;
		container.querySelector('input[name=axisHideScale]').checked = this.hideScale;
		container.querySelector('input[name=axisHideScaleLines]').checked = this.hideScaleLines;
		container.querySelector('input[name=axisDontAnimate]').checked = this.dontAnimate;

		container.querySelector('.delete').on('click', () => {
			this.axes.delete(this);
			this.axes.render();
		});

		return container;
	}

	get json() {

		return {
			position: this.container.querySelector('select[name=position]').value,
			type: this.container.querySelector('select[name=axis-type]').value,
			label: this.container.querySelector('input[name=label]').value,
			columns: this.container.multiSelectColumns.value.map(c => {return {key: c}}),
			restcolumns: this.container.querySelector('input[name=restcolumns]').checked,
			format: this.container.querySelector('select[name=format]').value,
			curve: this.container.querySelector('select[name=curve]').value,
			depth: this.container.querySelector('input[name=axisDepth]').value,
			lineThickness: this.container.querySelector('input[name=axisLineThickness]').value,
			maxTickLength: this.container.querySelector('input[name=maxTickLength]').value,
			stacked: this.container.querySelector('input[name=axisStacked]').checked,
			rotateTicks: this.container.querySelector('input[name=rotateTicks]').checked,
			contribution: this.container.querySelector('input[name=contribution]').checked,
			showValues: this.container.querySelector('input[name=axisShowValues]').checked,
			showPoints: this.container.querySelector('input[name=axisShowPoints]').checked,
			hideScale: this.container.querySelector('input[name=axisHideScale]').checked,
			hideScaleLines: this.container.querySelector('input[name=axisHideScaleLines]').checked,
			dontAnimate: this.container.querySelector('input[name=axisDontAnimate]').checked,
		};
	}
}

class ReportVisualizationOptions {

	constructor(visualization, page, stage) {
		this.visualization = visualization;
		this.page = page;
		this.stage = stage;
		this.checkMultipleAxes = true;
	}

	get form() {
		return document.createElement('form');
	}

	get json() {

		const result = {};

		for(const element of this.form.querySelectorAll('input, select')) {
			if(element.type != 'radio')
				result[element.name] = element[element.type == 'checkbox' ? 'checked' : 'value'];
		}

		return result;
	}
}

class ReportVisualizationLinearOptions extends ReportVisualizationOptions {

	get form() {

		if(this.formContainer)
			return this.formContainer;

		const container = this.formContainer = document.createElement('div');

		container.classList.add('liner-visualization-options');

		container.innerHTML = `
			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Axes <span class="count"></span></h3>
			</div>

			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Options</h3>
				<div class="body">
					<div class="form subform">

						<label>
							<span>
								<input type="checkbox" name="showValues"> Show Values
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideHeader"> Hide Header
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideLegend"> Hide Legend
							</span>
						</label>
					</div>
				</div>
			</div>
		`;

		this.formContainer.axes = new Set();

		this.axes = new Axes(this.visualization.options.axes, this, this.checkMultipleAxes);

		container.querySelector('.configuration-section').appendChild(this.axes.container);

		if(this.visualization.options && this.visualization.options.hideLegend)
			container.querySelector('input[name=hideLegend]').checked = this.visualization.options.hideLegend;

		if(this.visualization.options && this.visualization.options.hideHeader)
			container.querySelector('input[name=hideHeader]').checked = this.visualization.options.hideHeader;

		if(this.visualization.options && this.visualization.options.showValues)
			container.querySelector('input[name=showValues]').checked = this.visualization.options.showValues;

		return container;
	}

	get json() {

		const response = {
			axes: this.axes.json,
			hideHeader: this.formContainer.querySelector('input[name=hideHeader]').checked,
			hideLegend: this.formContainer.querySelector('input[name=hideLegend]').checked,
			showValues: this.formContainer.querySelector('input[name=showValues]').checked,
		};

		return response;
	}
}

class SpatialMapOptionsLayers extends Set {

	constructor(layers, stage) {

		super();

		this.stage = stage;

		for(const layer of layers)
			this.add(new (SpatialMapOptionsLayer.types.get(layer.type))(layer, this));
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');

		container.classList.add('options', 'form', 'body', 'layers');

		this.render();

		return container;
	}

	render() {

		this.container.textContent = null;

		this.stage.formContainer.querySelector('.configuration-section .count').innerHTML = `${this.size ? this.size + ' map layer' + ( this.size == 1 ? ' added' :'s added') : ''}`;

		if (!this.size)
			this.container.innerHTML = '<div class="NA">No layers added yet!</div>';

		for(const layer of this) {

			this.container.appendChild(layer.container);
		}

		this.container.insertAdjacentHTML('beforeend', `

			<div class="add-layer">
				<fieldset>
					<legend>Add New Layer</legend>
					<div class="form">

						<label>
							<span>Type</span>
							<select name="position" value="clustermap" required>
								<option value="clustermap">Cluster Map</option>
								<option value="heatmap">Heat Map</option>
								<option value="scattermap">Scatter Map</option>
								<option value="bubblemap">Bubble Map</option>
							</select>
						</label>

						<label>
							<span>&nbsp;</span>
							<button type="button"><i class="fa fa-plus"></i> Add</button>
						</label>
					</div>
				</fieldset>
			</div>
		`);

		this.container.querySelector('.add-layer button[type=button]').on('click', () => {

			const type = this.container.querySelector('.add-layer select').value;

			this.add(new (SpatialMapOptionsLayer.types.get(type))({type}, this));
			this.render();
		});
	}

	get json() {

		const response = [];

		for(const layer of this.values()) {
			response.push(layer.json);
		}

		return response;
	}
}

class SpatialMapOptionsLayer {

	constructor(layer, layers) {

		Object.assign(this, layer);

		this.layers = layers;
	}

	get container() {

		if(this.layerContainer)
			return this.layerContainer;

		const container = this.layerContainer = document.createElement('div');

		container.classList.add('layer');

		container.innerHTML = `
			<fieldset>
				<legend>${this.type.slice(0, 1).toUpperCase() + this.type.slice(1)}</legend>
				<div class="form">
					<label>
						<span>Name</span>
						<input type="text" name="layer_name">
					</label>

					<label>
						<span>Latitude Column</span>
						<select name="latitude"></select>
					</label>

					<label>
						<span>Longitude Column</span>
						<select name="longitude"></select>
					</label>

					<label>
						<button class="delete" type="button">
							<i class="far fa-trash-alt"></i> Delete
						</button>
					</label>
				</div>
			</fieldset>
		`;

		const
			latitude = container.querySelector('select[name=latitude]'),
			longitude = container.querySelector('select[name=longitude]');

		for(const [key, column] of this.layers.stage.page.preview.report.columns) {

			latitude.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);

			longitude.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);
		}

		container.querySelector('.delete').on('click', () => {

			container.parentElement && container.parentElement.removeChild(container);
			this.layers.delete(this);
			this.layers.render();
		});

		for(const element of container.querySelectorAll('select, input')) {

			if(this[element.tagName == 'SELECT' ? element.name.concat('Column') : element.name])
				element[element.type == 'checkbox' ? 'checked' : 'value'] = this[element.tagName == 'SELECT' ? element.name.concat('Column') : element.name] ;
		}

		return container;
	}

	get json() {

		const response = {
			type: this.type
		};

		for(const element of this.container.querySelectorAll('select, input')) {

			if(element.type == 'checkbox') {

				response[element.name] = element.checked;
			}
			else if (element.tagName == 'SELECT') {

				response[element.name.concat('Column')] = element.value;
			}
			else {

				response[element.name] = element.type == 'number' || element.type == 'range' ? parseFloat(element.value) : element.value;
			}
		}

		return response;
	}
}

SpatialMapOptionsLayer.types = new Map();

SpatialMapOptionsLayer.types.set('clustermap', class ClusterMapLayer extends SpatialMapOptionsLayer {
});

SpatialMapOptionsLayer.types.set('heatmap', class HeatMapLayer extends SpatialMapOptionsLayer {

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = super.container;

		container.querySelector('.delete').parentNode.insertAdjacentHTML('beforebegin', `
			<label>
				<span>Weight Column</span>
				<select name="weight">
					<option value=""></option>
				</select>
			</label>

			<label>
				<span>Radius</span>
				<input type="number" name="radius">
			</label>

			<label class="opacity">
				<span>Opacity <span class="value">${this.opacity || 0.6}</span></span>
				<input type="range" name="opacity" min="0" max="1" step="0.01">
			</label>
		`);

		container.querySelector('.opacity input').on('input', () => {

			container.querySelector('.opacity .value').textContent = container.querySelector('.opacity input').value;
		});

		const weight = container.querySelector('select[name=weight]');

		for(const [key, column] of this.layers.stage.page.preview.report.columns) {

			weight.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);
		}

		if(this.weightColumn)
			container.querySelector('select[name=weight]').value = this.weightColumn;

		if(this.opacity)
			container.querySelector('input[name=opacity]').value = this.opacity;

		if(this.radius)
			container.querySelector('input[name=radius]').value = this.radius;

		return container;
	}
});

SpatialMapOptionsLayer.types.set('scattermap', class ScatterMapLayer extends SpatialMapOptionsLayer {

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = super.container;

		container.querySelector('.delete').parentNode.insertAdjacentHTML('beforebegin', `
			<label>
				<span>Color Column</span>
				<select name="color">
					<option value=""></option>
				</select>
			</label>
		`);

		const color = container.querySelector('select[name=color]');

		for(const [key, column] of this.layers.stage.page.preview.report.columns) {

			color.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);
		}

		if(this.colorColumn)
			color.value = this.colorColumn;

		return container;
	}
});

SpatialMapOptionsLayer.types.set('bubblemap', class BubbleMapLayer extends SpatialMapOptionsLayer {

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = super.container;

		container.querySelector('.delete').parentNode.insertAdjacentHTML('beforebegin', `
			<label>
				<span>Color Column</span>
				<select name="color">
					<option value=""></option>
				</select>
			</label>

			<label>
				<span>Radius Column</span>
				<select name="radius"></select>
			</label>
		`);

		const
			radius = container.querySelector('select[name=radius]'),
			color = container.querySelector('select[name=color]');

		for(const [key, column] of this.layers.stage.page.preview.report.columns) {

			radius.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);

			color.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);
		}

		if(this.radiusColumn)
			radius.value = this.radiusColumn;

		if(this.colorColumn)
			color.value = this.colorColumn;

		return container;
	}
});

const ConfigureVisualization = VisualizationsManger.stages.get('configure-visualization');

ConfigureVisualization.types = new Map;

ConfigureVisualization.types.set('table', class TableOptions extends ReportVisualizationOptions {

	get form() {

		if(this.formContainer)
			return this.formContainer;

		const container = this.formContainer = document.createElement('div');

		container.innerHTML = `
			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Options</h3>
				<div class="body">
					<div class="form subform">

						<div class="gradient-rules"></div>

						<label>
							<button type="button" class="add-gradient">
								<i class="fa fa-plus"></i> Add New Gradient
							</button>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideHeadingsBar">Hide Headings Bar
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideRowSummary">Hide Row Summary
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideLegend">Hide Legend
							</span>
						</label>
					</div>
				</div>
			</div>
		`;

		const gradientRules = container.querySelector('.gradient-rules');

		container.querySelector('.add-gradient').on('click', () => {

			gradientRules.appendChild(this.rule());
			this.render();
			gradientRules.scrollTop = gradientRules.scrollHeight;
		});

		this.form = this.visualization.options;

		this.render();

		return container;
	}

	render() {

		const
			gradientFilter = this.form.querySelector('.gradient-rules'),
			gradientNotFound = this.form.querySelector('.gradient-rules .NA');

		if(!gradientFilter.children.length)
			gradientFilter.innerHTML = '<div class="NA">No Gradient Found</div>';

		else if(gradientNotFound)
			gradientNotFound.remove();
	}

	rule(selected = {}) {

		const container = document.createElement('div');

		container.classList.add('rule');

		container.innerHTML = `

			<label>
				<span>Column</span>
				<select name="column"></select>
			</label>

			<label>
				<span>Relative To</span>
				<select name="relative"></select>
			</label>

			<label>
				<span>Dual Color</span>
				<select name="dualColor">
					<option value="1">Yes</option>
					<option value="0">No</option>
				</select>
			</label>

			<label>
				<span>Maximum Value</span>
				<input type="color" name="maximumColor" value="${selected.maximumColor}">
			</label>

			<label class="minimum-color">
				<span>Minimum Value</span>
				<input type="color" name="minimumColor" value="${selected.minimumColor}">
			</label>

			<label>
				<span>Gradient Threshold %</span>
				<input type="number" min="0" max="100" name="gradientThreshold" value="${selected.gradientThreshold}">
			</label>

			<label>
				<span>Content</span>
				<select name="content">
					<option value="empty">Empty</option>
					<option value="value">Value</option>
					<option value="percentage">Percentage</option>
					<option value="both">Both</option>
				</select>
			</label>

			<button type="button" class="delete"><i class="far fa-trash-alt delete-icon"></i></button>
		`;

		const
			columnSelect = container.querySelector('select[name=column]'),
			relativeSelect = container.querySelector('select[name=relative]');

		for(const [key, column] of this.page.preview.report.columns) {

			columnSelect.insertAdjacentHTML('beforeend', `<option value="${key}">${column.name}</option>`);
			relativeSelect.insertAdjacentHTML('beforeend', `<option value="${key}">${column.name}</option>`);
		}

		for(const element of container.querySelectorAll('select')) {

			if(element.name in selected)
				element.value = selected[element.name];
		}

		const
			dualColor = container.querySelector('select[name="dualColor"]'),
			minimumColor = container.querySelector('.minimum-color');

		minimumColor.classList.toggle('hidden', !parseInt(dualColor.value));

		dualColor.on('change', () => minimumColor.classList.toggle('hidden', !parseInt(dualColor.value)));

		container.querySelector('button').on('click', e => {

			e.stopPropagation();
			container.remove();

			this.render();
		});

		return container;
	}

	set form(json) {

		for(const element of this.form.querySelectorAll('select, input'))
			element[element.type == 'checkbox' ? 'checked' : 'value'] = json && json[element.name];

		const gradientRules = this.form.querySelector('.gradient-rules');

		for(const value of json.gradientRules || [])
			gradientRules.appendChild(this.rule(value));
	}

	get json() {

		const result = {
			gradientRules: [],
			hideHeadingsBar: this.form.querySelector('input[name="hideHeadingsBar"]').checked,
			hideRowSummary: this.form.querySelector('input[name="hideRowSummary"]').checked,
			hideLegend: this.form.querySelector('input[name="hideLegend"]').checked,
		};

		for(const rule of this.form.querySelectorAll('.rule')) {

			result.gradientRules.push({
				column: rule.querySelector('select[name="column"]').value,
				relative: rule.querySelector('select[name="relative"]').value,
				dualColor: parseInt(rule.querySelector('select[name="dualColor"]').value),
				maximumColor: rule.querySelector('input[name="maximumColor"]').value,
				minimumColor: rule.querySelector('input[name="minimumColor"]').value,
				gradientThreshold: parseFloat(rule.querySelector('input[name="gradientThreshold"]').value),
				content: rule.querySelector('select[name="content"').value,
			});
		}

		const gradientRules = {};

		for(const gradient of result.gradientRules) {

			if(gradient.column in gradientRules) {

				new SnackBar({
					message: `Gradient already exists for ${this.page.preview.report.columns.get(gradient.column).name}.`,
					type: 'error',
				});

				throw `Gradient already exists for ${this.page.preview.report.columns.get(gradient.column).name}.`;
			}

			gradientRules[gradient.column] = gradient;
		}

		return result;
	}
});

ConfigureVisualization.types.set('line', class LineOptions extends ReportVisualizationLinearOptions {
});

ConfigureVisualization.types.set('scatter', class ScatterOptions extends ReportVisualizationLinearOptions {
});

ConfigureVisualization.types.set('bubble', class BubbleOptions extends ReportVisualizationLinearOptions {

	constructor(visualization, page, stage) {

		super(visualization, page, stage);

		this.checkMultipleAxes = false;
	}

	get form() {

		if(this.bubbleFormContainer) {

			return this.bubbleFormContainer;
		}

		const
			container = this.bubbleFormContainer = super.form,
			optionsForm = container.querySelector('.configuration-section .body .form.subform');

		let selectOptions = '';

		for(const [key, column] of this.page.preview.report.columns) {

			selectOptions = selectOptions.concat(`<option value="${key}">${column.name}</option>`);
		}

		optionsForm.querySelector('input[name=showValues]').parentElement.parentElement.remove();

		const bubbleOptions = `
			<label>
				<span>Bubble Column</span>
				<select name="bubbleColumn">
					${selectOptions}
				</select>
			</label>

			<label>
				<span>Radius Column</span>
				<select name="radius">
					${selectOptions}
				</select>
			</label>

			<label>
				<span>Bubble Text</span>
				<select name="showValues">
					<option value="empty">Empty</option>
					${selectOptions}
				</select>
			</label>
		`;

		optionsForm.insertAdjacentHTML('afterbegin', bubbleOptions);

		optionsForm.querySelector('select[name=bubbleColumn]').value = this.visualization.options.bubbleColumn;
		optionsForm.querySelector('select[name=radius]').value = this.visualization.options.bubbleRadiusColumn;
		optionsForm.querySelector('select[name=showValues]').value = this.visualization.options.showValues || 'empty';

		return container;
	}

	get json() {

		return {
			axes: this.axes.json,
			hideHeader: this.form.querySelector('input[name=hideHeader]').checked,
			hideLegend: this.form.querySelector('input[name=hideLegend]').checked,
			bubbleColumn: this.form.querySelector('.configuration-section .body .form.subform select[name=bubbleColumn]').value,
			bubbleRadiusColumn: this.form.querySelector('.configuration-section .body .form.subform select[name=radius]').value,
			showValues: this.form.querySelector('.configuration-section .body .form.subform select[name=showValues]').value
		}
	}
});

ConfigureVisualization.types.set('bar', class BarOptions extends ReportVisualizationLinearOptions {
});

ConfigureVisualization.types.set('dualaxisbar', class DualAxisBarOptions extends ReportVisualizationLinearOptions {
});

ConfigureVisualization.types.set('linear', class LinearOptions extends ReportVisualizationLinearOptions {

	get form() {

		if(this.formContainer)
			return this.formContainer;

		const container = this.formContainer = document.createElement('div');

		container.classList.add('liner-visualization-options');

		container.innerHTML = `
			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Axes <span class="count"></span></h3>
			</div>

			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Options</h3>
				<div class="body">
					<div class="form subform">

						<label>
							<span>
								<input type="checkbox" name="hideHeader"> Hide Header
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideLegend"> Hide Legend
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="showValues"> Show Values
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="showPoints"> Show Points
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideScales"> Hide Scales
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideScaleLines"> Hide Scale Lines
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="dontAnimate"> Don't Animate
							</span>
						</label>
					</div>
				</div>
			</div>
		`;

		this.formContainer.axes = new Set();

		this.axes = new LinearAxes(this.visualization.options.axes, this);

		container.querySelector('.configuration-section').appendChild(this.axes.container);

		if(this.visualization.options && this.visualization.options.hideLegend)
			container.querySelector('input[name=hideLegend]').checked = this.visualization.options.hideLegend;

		if(this.visualization.options && this.visualization.options.hideHeader)
			container.querySelector('input[name=hideHeader]').checked = this.visualization.options.hideHeader;

		if(this.visualization.options && this.visualization.options.showValues)
			container.querySelector('input[name=showValues]').checked = this.visualization.options.showValues;

		if(this.visualization.options && this.visualization.options.showPoints)
			container.querySelector('input[name=showPoints]').checked = this.visualization.options.showPoints;

		if(this.visualization.options && this.visualization.options.hideScales)
			container.querySelector('input[name=hideScales]').checked = this.visualization.options.hideScales;

		if(this.visualization.options && this.visualization.options.hideScaleLines)
			container.querySelector('input[name=hideScaleLines]').checked = this.visualization.options.hideScaleLines;

		if(this.visualization.options && this.visualization.options.dontAnimate)
			container.querySelector('input[name=dontAnimate]').checked = this.visualization.options.dontAnimate;

		return container;
	}

	get json() {

		const response = {
			axes: this.axes.json,
			hideHeader: this.formContainer.querySelector('input[name=hideHeader]').checked,
			hideLegend: this.formContainer.querySelector('input[name=hideLegend]').checked,
			showValues: this.formContainer.querySelector('input[name=showValues]').checked,
			showPoints: this.formContainer.querySelector('input[name=showPoints]').checked,
			hideScales: this.formContainer.querySelector('input[name=hideScales]').checked,
			hideScaleLines: this.formContainer.querySelector('input[name=hideScaleLines]').checked,
			dontAnimate: this.formContainer.querySelector('input[name=dontAnimate]').checked,
		};

		return response;
	}
});

ConfigureVisualization.types.set('stacked', class StackedOptions extends ReportVisualizationLinearOptions {
});

ConfigureVisualization.types.set('area', class AreaOptions extends ReportVisualizationLinearOptions {
});

ConfigureVisualization.types.set('pie', class PieOptions extends ReportVisualizationOptions {

	get form() {

		if(this.formContainer)
			return this.formContainer;

		const container = this.formContainer = document.createElement('div');

		container.innerHTML = `
			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Options</h3>
				<div class="body">
					<div class="form subform">

						<label>
							<span>Label Position</span>
							<select name="labelPosition">
								<option value="inside">Inside</option>
								<option value="outside">Outside</option>
							</select>
						</label>

						<label>
							<span>
								<input type="checkbox" name="showValue">Show Value
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="showPercentage">Show Percentage
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="showName">Show Name
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="classicPie">Classic Pie
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideLegend">Hide Legend
							</span>
						</label>
					</div>
				</div>
			</div>
		`;

		for(const element of this.formContainer.querySelectorAll('select, input'))
			element[element.type == 'checkbox' ? 'checked' : 'value'] = this.visualization.options && this.visualization.options[element.name];

		return container;
	}
});

ConfigureVisualization.types.set('funnel', class FunnelOptions extends ReportVisualizationOptions {
});

ConfigureVisualization.types.set('spatialmap', class SpatialMapOptions extends ReportVisualizationOptions {

	get form() {

		if(this.formContainer)
			return this.formContainer;

		const container = this.formContainer = document.createElement('div');

		container.innerHTML = `
			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Map Layers <span class="count"></span></h3>
			</div>

			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Options</h3>
				<div class="body">
					<div class="form subform map-options">
						<label>
							<span>Zoom</span>
							<input type="number" step="1" name="zoom" min="1" max="25">
						</label>

						<label>
							<span>Center Latitude</span>
							<input type="number" name="centerLatitude">
						</label>

						<label>
							<span>Center Longitude</span>
							<input type="number" name="centerLongitude">
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideLegend">Hide Legend
							</span>
						</label>
					</div>
				</div>
			</div>

			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Themes</h3>
				<div class="body">
					<div class="form subform map-themes"></div>
				</div>
			</div>
		`;

		this.layers = new SpatialMapOptionsLayers(this.visualization.options.layers || [], this);

		container.querySelector('.configuration-section').appendChild(this.layers.container);

		const mapOptions = container.querySelector('.map-options');

		if(this.visualization.options) {

			for(const element of mapOptions.querySelectorAll('select, input')) {

				if(!this.visualization.options[element.name])
					continue;

				element[element.type == 'checkbox' ? 'checked' : 'value'] = this.visualization.options[element.name];
			}
		}

		this.themes = new SpatialMapThemes(this.visualization);

		container.querySelector('.map-themes').appendChild(this.themes.container);

		return container;
	}

	get json() {

		const
			mapOptions = this.formContainer.querySelector('.map-options'),
			response = {
				layers: this.layers.json,
				theme: this.themes.selected
			};

		for (const element of mapOptions.querySelectorAll('select, input')) {

			if(element.type == 'checkbox') {

				response[element.name] = element.checked;
			}
			else {

				response[element.name] = element.type == 'number' ? parseFloat(element.value) : element.value;
			}
		}

		return response;
	}
});

ConfigureVisualization.types.set('cohort', class CohortOptions extends ReportVisualizationOptions {
});

ConfigureVisualization.types.set('json', class JSONOptions extends ReportVisualizationOptions {
});

ConfigureVisualization.types.set('bigtext', class BigTextOptions extends ReportVisualizationOptions {

	get form() {

		if(this.formContainer)
			return this.formContainer;

		const container = this.formContainer = document.createElement('div');

		let datalist = [];

		for(const [key, column] of this.page.preview.report.columns)
			datalist.push({name: column.name, value: key});

		this.bigReportsColumns = new MultiSelect({datalist: datalist, expand: true, multiple: false});

		container.innerHTML = `
			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Options</h3>
				<div class="body">
					<div class="form subform">
						<label class="axis-column">
							<span>Columns</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideLegend">Hide Legend
							</span>
						</label>

						<label>
							<span>Font Size <span class="NA right">percentage</span></span>
							<input type="number" name="fontSize" min="0.1" max="3000" step="0.01" placeholder="815">
						</label>
					</div>
				</div>
			</div>
		`;

		container.querySelector('.axis-column').appendChild(this.bigReportsColumns.container);

		this.bigReportsColumns.value = this.visualization.options && this.visualization.options.column || [];

		for(const element of this.formContainer.querySelectorAll('select, input')) {
			if(element.type != 'radio')
				element[element.type == 'checkbox' ? 'checked' : 'value'] = (this.visualization.options && this.visualization.options[element.name]) || '';
		}

		return container;
	}

	get json() {

		const parentJSON = super.json;

		parentJSON.fontSize = parseFloat(parentJSON.fontSize);
		parentJSON.column = this.bigReportsColumns.value[0];

		return parentJSON;
	}
});

ConfigureVisualization.types.set('livenumber', class LiveNumberOptions extends ReportVisualizationOptions {

	get form() {

		if (this.formContainer)
			return this.formContainer;

		const container = this.formContainer = document.createElement('div');

		container.innerHTML = `
			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Options</h3>
				<div class="body">
					<div class="form subform">
						<label>
							<span>Timing Column</span>
							<select name="timingColumn"></select>
						</label>

						<label>
							<span>Value Column</span>
							<select name="valueColumn"></select>
						</label>

						<label>
							<span>Center Offset</span>
							<input type="number" name="centerOffset">
						</label>

						<label>
							<span>Left Offset</span>
							<input type="number" name="leftOffset">
						</label>

						<label>
							<span>Right Offset</span>
							<input type="number" name="rightOffset">
						</label>

						<label>
							<span>Change Prefix</span>
							<input type="text" name="changePrefix">
						</label>

						<label>
							<span>Change Postfix</span>
							<input type="text" name="changePostfix">
						</label>

						<label>
							<span>
								<input type="checkbox" name="invertValues"> Invert Values
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="showGraph"> Show Graph
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="graphParallax"> Graph Parallax
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideLegend"> Hide Legend
							</span>
						</label>
					</div>
				</div>
			</div>
		`;

		const datalist = [];

		for(const [index, report] of DataSource.list.entries()) {

			for(const visualisation of report.visualizations) {

				if(visualisation.type == 'livenumber' && visualisation.visualization_id != this.visualization.visualization_id) {

					datalist.push({
						'name': `${visualisation.name} #${visualisation.visualization_id}`,
						'value': visualisation.visualization_id,
						'subtitle': `${report.subtitle && MetaData.categories.has(report.subtitle) ? MetaData.categories.get(report.subtitle).name + ' &rsaquo; ' : ''}${report.name} #${report.query_id}`,
					});
				}
			}
		}

		const
			timingColumn = container.querySelector('select[name=timingColumn]'),
			valueColumn = container.querySelector('select[name=valueColumn]');

		for(const [key, column] of this.page.preview.report.columns) {

			timingColumn.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);

			valueColumn.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);
		}

		for(const element of this.formContainer.querySelectorAll('select, input')) {

			element[element.type == 'checkbox' ? 'checked' : 'value'] = (this.visualization.options && this.visualization.options[element.name]) || '';
		}

		return container;
	}

	get json() {

		const result = super.json;

		return result;
	}
});

ConfigureVisualization.types.set('sankey', class SankeyOptions extends ReportVisualizationOptions {

	get form() {

		if (this.formContainer)
			return this.formContainer;

		const container = this.formContainer = document.createElement('div');

		container.innerHTML = `
			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Options</h3>
				<div class="body">
					<div class="form subform">
						<label>
							<span>Source Column</span>
							<select name="sourceColumn"></select>
						</label>

						<label>
							<span>Target Column</span>
							<select name="targetColumn"></select>
						</label>

						<label>
							<span>Value Column</span>
							<select name="valueColumn"></select>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideLegend"> Hide Legend
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideTooltip"> Hide Tooltip
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideHeader"> Hide Header
							</span>
						</label>
					</div>
				</div>
			</div>
		`;

		const
			sourceColumn = container.querySelector('select[name=sourceColumn]'),
			targetColumn = container.querySelector('select[name=targetColumn]'),
			valueColumn = container.querySelector('select[name=valueColumn]');

		for(const [key, column] of this.page.preview.report.columns) {

			sourceColumn.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);

			targetColumn.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);

			valueColumn.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);
		}

		for(const element of this.formContainer.querySelectorAll('select, input')) {

			element[element.type == 'checkbox' ? 'checked' : 'value'] = (this.visualization.options && this.visualization.options[element.name]) || '';
		}

		return container;
	}
});

ConfigureVisualization.types.set('html', class HTMLOptions extends ReportVisualizationOptions {

	constructor(...parameters) {

		super(...parameters);

		this.htmlEditor = new HTMLEditor();
	}

	get form() {

		if (this.formContainer)
			return this.formContainer;

		const container = this.formContainer = document.createElement('div');

		container.innerHTML = `
			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Body</h3>
				<div class="body">
					<div class="form subform html-body"></div>
				</div>
			</div>

			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Options</h3>
				<div class="body">
					<div class="form subform">

						<label>
							<span>
								<input type="checkbox" name="flushBackground">Flush Background
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideHeader">Hide Header
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideLegend">Hide Legend
							</span>
						</label>
					</div>
				</div>
			</div>
		`;

		for(const element of this.formContainer.querySelectorAll('select, input'))
			element[element.type == 'checkbox' ? 'checked' : 'value'] = (this.visualization.options && this.visualization.options[element.name]) || '';

		const body = container.querySelector('.html-body');

		body.appendChild(this.htmlEditor.container);

		setTimeout(async () => {
			await this.htmlEditor.setup();
			this.htmlEditor.value = this.visualization.options.body || '';
		});

		return container;
	}

	get json() {

		return {
			...super.json,
			body: this.htmlEditor.value,
		}
	}
});

ConfigureVisualization.types.set('calendar', class calendarOptions extends ReportVisualizationOptions {

	get form() {

		if (this.formContainer) {

			return this.formContainer;
		}

		const container = this.formContainer = document.createElement('div');

		container.innerHTML = `
			<div class="configuration-section">
				<h3><i class="fas fa-angle-right"></i> Options</h3>
				<div class="body">
					<div class="form subform">

						<label>
							<span>Timing Column</span>
							<select name="timingColumn"></select>
						</label>

						<label>
							<span>Value Column</span>
							<select name="valueColumn"></select>
						</label>

						<label>
							<span>
								<input type="checkbox" name="invertValues"> Invert Values
							</span>
						</label>

						<label>
							<span>
								<input type="checkbox" name="hideLegend"> Hide Legend
							</span>
						</label>

						<label>
							<span> Orientation</span>
							<select name="orientation">
								<option value="verticalStretched"> Vertical Stretched</option>
								<option value="vertical"> Vertical</option>
								<option value="horizontal"> Horizontal</option>
							</select>
						</label>

						<label>
							<span> Cell Value</span>
							<select name="cellValue">
								<option value="timing" selected="selected"> Timing</option>
								<option value="value"> Value</option>
								<option value="both"> Both Timing and Value</option>
								<option value="blank"> Blank</option>
							</select>
						</label>
					</div>
				</div>
			</div>
		`;

		const
			timingColumn = container.querySelector('select[name=timingColumn]'),
			valueColumn = container.querySelector('select[name=valueColumn]');

		for(const [key, column] of this.page.preview.report.columns) {

			timingColumn.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);

			valueColumn.insertAdjacentHTML('beforeend', `
				<option value="${key}">${column.name}</option>
			`);
		}

		for(const element of this.formContainer.querySelectorAll('select, input')) {

			element[element.type == 'checkbox' ? 'checked' : 'value'] = (this.visualization.options && this.visualization.options[element.name]) || '';
		}

		return container;
	}
});

class ReportTransformations extends Set {

	constructor(visualization, stage) {

		super();

		this.visualization = visualization;
		this.stage = stage;
		this.page = this.stage.page;
	}

	get container () {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');
		container.classList.add('configuration-section', 'transformations');

		container.innerHTML = `
			<h3>
				<i class="fas fa-angle-right"></i> Transformations
				<span class="count"></span>
			</h3>
			<div class="body">
				<div class="list"></div>
				<form class="add-transformation">
					<fieldset>
						<legend>Add Transformation</legend>
						<div class="form">

							<label>
								<span>Type</span>
								<select name="type"></select>
							</label>

							<label>
								<span>&nbsp;</span>
								<button type="submit"><i class="fa fa-plus"></i> Add</button>
							</label>
						</div>
					</fieldset>
				</form>
			</div>`;

		const select = this.container.querySelector('.add-transformation select');

		for(const [key, type] of DataSourceTransformation.types)
			select.insertAdjacentHTML('beforeend', `<option value="${key}">${new type().name}</option>`);

		this.container.querySelector('.add-transformation').on('submit', e => this.insert(e));

		return container;
	}

	load() {

		this.process();

		this.render();
	}

	process() {

		this.clear();

		if(!this.visualization.options)
			return;

		for(const transformation of this.visualization.options.transformations || []) {

			if(ReportTransformation.types.has(transformation.type))
				this.add(new (ReportTransformation.types.get(transformation.type))(transformation, this));
		}
	}

	render() {

		const
			transformationsList = this.container.querySelector('.list'),
			originalResponse = this.page.preview.report.originalResponse;

		transformationsList.textContent = null;

		transformationsList.insertAdjacentHTML('beforeend', `

			<fieldset class="subform">
				<div class="actions">
					<div class="preview" title="Preview Data"><i class="fas fa-eye"></i></div>
				</div>
				<legend>Report Executed</legend>
			</fieldset>

			<div class="next-connector">
				<i class="fas fa-long-arrow-alt-down"></i>
				<span class="NA">
					<span>Rows: <strong>${Format.number(originalResponse ? originalResponse.data.length : 0)}</strong></span>
					<span>Columns: <strong>${Format.number(Object.keys(originalResponse && originalResponse.data.length ? originalResponse.data[0] : {} || {}).length)}</strong></span>
					<span>Duration: <strong>${Format.number(originalResponse ? originalResponse.runtime || 0 : 0)}ms</strong></span>
				</span>
				<i class="fas fa-long-arrow-alt-down"></i>
			</div>
		`);

		transformationsList.querySelector('fieldset .actions .preview').on('click', () => this.preview(-1));

		for(const transformation of this) {

			transformationsList.appendChild(transformation.container);
			transformation.render && transformation.render();

			transformationsList.insertAdjacentHTML('beforeend', `
				<div class="next-connector">
					<i class="fas fa-long-arrow-alt-down"></i>
					<span class="NA">
						<span>Rows: <strong>${Format.number(transformation.outgoing.rows || 0)}</strong></span>
						<span>Columns: <strong>${Format.number(transformation.outgoing.columns.size)}</strong></span>
						<span>Duration: <strong>${Format.number(transformation.executionDuration)}ms</strong></span>
					</span>
					<i class="fas fa-long-arrow-alt-down"></i>
				</div>
			`);
		}

		transformationsList.insertAdjacentHTML('beforeend', `

			<fieldset class="subform">
				<legend>Visualization Loaded</legend>
			</fieldset>
		`);

		this.container.querySelector('h3 .count').innerHTML = `
			${this.size ? this.size + ' transformation' + (this.size == 1 ? ' applied' : 's applied') : ''}
		`;
	}

	get json() {

		const response = [];

		for(const transformation of this)
			response.push(transformation.json);

		return response.filter(a => a);
	}

	async preview(stopAt) {

		const report = DataSource.list.get(this.stage.report.query_id);

		if(!report)
			return;

		if(!report.transformationVisualization) {

			const visualization = {
				visualization_id: 0,
				name: 'Table',
				type: 'table',
				options: {
					hideLegend: this.visualization.options.hideLegend
				},
			};

			report.visualizations.push(visualization);
			report.transformationVisualization = visualization;
		}

		report.transformationVisualization.options.transformations = this.json;
		report.transformationVisualization.options.transformationsStopAt = stopAt;

		await this.page.preview.load({
			query_id: this.stage.report.query_id,
			visualization: {
				id: report.transformationVisualization.visualization_id
			},
		});

		this.render();
	}

	clear() {

		super.clear();
		this.container.querySelector('.list').innerHTML = '<div class="NA">Loading&hellip;</div>';
	}

	insert(e) {

		e.preventDefault();

		const type = this.container.querySelector('.add-transformation select').value;

		this.add(new (ReportTransformation.types.get(type))({type}, this));

		this.preview();
	}
}

class ReportTransformation {

	constructor(transformation, transformations) {

		this.transformations = transformations;
		this.stage = this.transformations.stage;
		this.page = this.stage.page;

		Object.assign(this, transformation);

		const type = DataSourceTransformation.types.get(this.key);

		this.name = new type().name;

		if(!this.options)
			this.options = {};
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('fieldset');

		container.classList.add('subform', 'form');

		container.innerHTML = `
			<div class="actions">
				<div class="move-up" title="Move Up"><i class="fas fa-angle-up"></i></div>
				<div class="move-down" title="Move Down"><i class="fas fa-angle-down"></i></div>
				<div class="preview" title="Preview Data"><i class="fas fa-eye"></i></div>
				<div class="remove" title="Remove Transformation"><i class="fa fa-times"></i></div>
			</div>
			<legend class="interactive">${this.name}</legend>
			<div class="ellipsis"><i class="fas fa-ellipsis-h"></i></div>
			<div class="transformation ${this.key} hidden"></div>
		`;

		container.querySelector('legend').on('click', () => {
			container.querySelector('.transformation').classList.toggle('hidden');
			container.querySelector('.ellipsis').classList.toggle('hidden');
		});

		container.querySelector('.ellipsis').on('click', () => {
			container.querySelector('.transformation').classList.toggle('hidden');
			container.querySelector('.ellipsis').classList.toggle('hidden');
		});

		container.querySelector('.actions .move-up').on('click', () => {

			const
				list = Array.from(this.transformations),
				position = list.indexOf(this);

			if(position == 0)
				return;

			list.splice(position, 1);
			list.splice(position - 1, 0, this);

			this.transformations.clear();

			for(const transformation of list)
				this.transformations.add(transformation);

			this.transformations.preview();
		});

		container.querySelector('.actions .move-down').on('click', () => {

			const
				list = Array.from(this.transformations),
				position = list.indexOf(this);

			if(position == list.length - 1)
				return;

			list.splice(position, 1);
			list.splice(position + 1, 0, this);

			this.transformations.clear();

			for(const transformation of list)
				this.transformations.add(transformation);

			this.transformations.preview();
		});

		container.querySelector('.actions .preview').on('click', () => {

			const
				list = Array.from(this.transformations),
				position = list.indexOf(this);

			this.transformations.preview(position);
		});

		container.querySelector('.actions .remove').on('click', () => {
			this.transformations.delete(this);
			this.transformations.preview();
		});

		return container;
	}

	get incoming() {

		const
			position = Array.from(this.transformations).indexOf(this),
			transformation = Array.from(this.page.preview.report.transformations)[position];

		return transformation ? transformation.incoming : {columns: this.page.preview.report.columns};
	}

	get outgoing() {

		const
			position = Array.from(this.transformations).indexOf(this),
			transformation = Array.from(this.page.preview.report.transformations)[position];

		return transformation ? transformation.outgoing : {columns: this.page.preview.report.columns};
	}

	get executionDuration() {

		const
			position = Array.from(this.transformations).indexOf(this),
			transformation = Array.from(this.page.preview.report.transformations)[position];

		return transformation ? transformation.executionDuration : 0;
	}

	get json() {

		const response = {
			type: this.key,
		};

		return response;
	}
}

ReportTransformation.types = new Map;

ReportTransformation.types.set('pivot', class ReportTransformationPivot extends ReportTransformation {

	get key() {
		return 'pivot';
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		if(!this.page.preview.report.originalResponse)
			return;

		const
			container = super.container.querySelector('.transformation'),
			rows = document.createElement('div'),
			columns = document.createElement('div'),
			values = document.createElement('div');

		rows.classList.add('rows');
		columns.classList.add('columns');
		values.classList.add('values');

		rows.innerHTML = `<h4>Rows</h4>`;
		columns.innerHTML = `<h4>Columns</h4>`;
		values.innerHTML = `<h4>Values</h4>`;

		for(const row of this.options.rows || [])
			rows.appendChild(this.row(row));

		const addRow = document.createElement('button');

		addRow.type = 'button';
		addRow.innerHTML = `<i class="fa fa-plus"></i> Add New Row`;

		addRow.on('click', () => {
			rows.insertBefore(this.row(), addRow);
			this.render();
		});

		rows.appendChild(addRow);

		for(const column of this.options.columns || [])
			columns.appendChild(this.column(column));

		const addColumn = document.createElement('button');

		addColumn.type = 'button';
		addColumn.innerHTML = `<i class="fa fa-plus"></i> Add New Column`;

		addColumn.on('click', () => {
			columns.insertBefore(this.column(), addColumn);
			this.render();
		});

		columns.appendChild(addColumn);

		for(const value of this.options.values || [])
			values.appendChild(this.value(value));

		const addValue = document.createElement('button');

		addValue.type = 'button';
		addValue.innerHTML = `<i class="fa fa-plus"></i> Add New Value`;

		addValue.on('click', () => {
			values.insertBefore(this.value(), addValue);
			this.render();
		});

		values.appendChild(addValue);

		container.appendChild(rows);
		container.appendChild(columns);
		container.appendChild(values);

		this.render();

		return super.container;
	}

	get json() {

		const response = super.json;

		response.options = {
			rows: [],
			columns: [],
			values: [],
		};

		for(const row of this.container.querySelectorAll('.row')) {
			response.options.rows.push({
				column: row.querySelector('*[name=column]').value,
			});
		}

		for(const column of this.container.querySelectorAll('.column')) {
			response.options.columns.push({
				column: column.querySelector('*[name=column]').value,
			});
		}

		for(const value of this.container.querySelectorAll('.value')) {
			response.options.values.push({
				column: value.querySelector('*[name=column]').value,
				function: value.querySelector('select[name=function]').value,
				name: value.querySelector('input[name=name]').value
			});
		}

		if(!response.options.rows.length && !response.options.columns.length && !response.options.values.length)
			return null;

		return response;
	}

	row(row = {}) {

		const container = document.createElement('div');

		container.classList.add('form-row', 'row');

		container.innerHTML = `<select name="column" data-value="${row.column}"></select>`;

		container.insertAdjacentHTML('beforeend',`<button type="button"><i class="far fa-trash-alt"></i></button>`);

		container.querySelector('button').on('click', e => {
			e.stopPropagation();
			container.remove();
		});

		return container;
	}

	column(column = {}) {

		const container = document.createElement('div');

		container.classList.add('form-row', 'column');

		container.innerHTML = `<select name="column" data-value="${column.column}"></select>`;

		container.insertAdjacentHTML('beforeend',`<button type="button"><i class="far fa-trash-alt"></i></button>`);

		container.querySelector('button').on('click', () => container.remove());

		return container;
	}

	value(value = {}) {

		const container = document.createElement('div');

		container.classList.add('form-row', 'value');

		container.innerHTML = `<select name="column" data-value="${value.column}"></select>`;

		container.insertAdjacentHTML('beforeend',`
			<select name="function">
				<option value="sum">Sum</option>
				<option value="count">Count</option>
				<option value="distinctcount">Distinct Count</option>
				<option value="values">Values</option>
				<option value="distinctvalues">Distinct Values</option>
				<option value="max">Max</option>
				<option value="min">Min</option>
				<option value="average">Average</option>
			</select>
			<input type="text" name="name" value="${value.name || ''}" placeholder="Name">
			<button type="button"><i class="far fa-trash-alt"></i></button>
		`);

		if(value.function)
			container.querySelector('select[name=function]').value = value.function;

		container.querySelector('button').on('click', () => container.remove());

		return container;
	}

	render() {

		for(const select of this.container.querySelectorAll('select[name=column]')) {

			const value = select.value;

			select.textContent = null;

			for(const column of this.incoming.columns.values())
				select.insertAdjacentHTML('beforeend', `<option value="${column.key}">${column.name}</option>`);

			select.value = value || select.dataset.value;
		}
	}
});

ReportTransformation.types.set('filters', class ReportTransformationFilters extends ReportTransformation {

	get key() {
		return 'filters';
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		if(!this.page.preview.report.originalResponse)
			return;

		const container = super.container.querySelector('.transformation');

		container.textContent = null;

		for(const filter of this.options.filters || [])
			container.appendChild(this.filter(filter));

		const addFilter = document.createElement('button');

		addFilter.type = 'button';
		addFilter.innerHTML = `<i class="fa fa-plus"></i> Add New Filter`;

		addFilter.on('click', () => {
			container.insertBefore(this.filter(), addFilter);
			this.render();
		});

		container.appendChild(addFilter);

		this.render();

		return super.container;
	}

	get json() {

		const response = super.json;

		response.options = {
			filters: [],
		};

		for(const filter of this.container.querySelectorAll('.filter')) {

			response.options.filters.push({
				column: filter.querySelector('select[name=column]').value,
				function: filter.querySelector('select[name=function]').value,
				value: filter.querySelector('input[name=value]').value,
			});
		}

		if(!response.options.filters.length) {
			return null;
		}

		return response;
	}

	render() {

		for(const select of this.container.querySelectorAll('select[name=column]')) {

			const value = select.value;

			select.textContent = null;

			for(const column of this.incoming.columns.values())
				select.insertAdjacentHTML('beforeend', `<option value="${column.key}">${column.name}</option>`);

			select.value = value || select.dataset.value;
		}
	}

	filter(filter = {}) {

		const container = document.createElement('div');

		container.classList.add('form-row', 'filter');

		container.innerHTML = `
			<select name="column"></select>
			<select name="function"></select>
			<input type="text" name="value">
			<button type="button" class="remove"><i class="far fa-trash-alt"></i></button>
		`;

		const
			columnSelect = container.querySelector('select[name=column]'),
			functionSelect = container.querySelector('select[name=function]'),
			valueInput = container.querySelector('input[name=value]');

		columnSelect.dataset.value = filter.column;

		for(const filter of DataSourceColumnFilter.types)
			functionSelect.insertAdjacentHTML('beforeend', `<option value="${filter.slug}">${filter.name}</option>`);

		if(filter.function)
			functionSelect.value = filter.function;

		if(filter.value)
			valueInput.value = filter.value;

		container.querySelector('.remove').on('click', e => {
			e.stopPropagation();
			container.remove();
		});

		return container;
	}
});

ReportTransformation.types.set('autofill', class ReportTransformationAutofill extends ReportTransformation {

	get key() {
		return 'autofill';
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		if(!this.page.preview.report.originalResponse)
			return;

		const container = super.container.querySelector('.transformation');

		container.classList.add('autofill')

		container.insertAdjacentHTML('beforeend', `

			<label>
				<span>Column</span>
				<select name="column"></select>
			</label>

			<label>
				<span>Granularity</span>
				<select name="granularity">
					<option value=""></option>
					<option value="number">Number</option>
					<option value="second">Second</option>
					<option value="minute">Minute</option>
					<option value="hour">Hour</option>
					<option value="date">Date</option>
					<option value="month">Month</option>
					<option value="year">Year</option>
				</select>
			</label>

			<label>
				<span>Fill With</span>
				<input type="text" name="content" value="${this.options.content || ''}">
			</label>

			<label>
				<span>Start Filter</span>
				<select name="start_filter">
					<option value=""></option>
				</select>
			</label>

			<label>
				<span>End Filter</span>
				<select name="end_filter">
					<option value=""></option>
				</select>
			</label>
		`);

		const
			column = container.querySelector('select[name=column]'),
			granularity = container.querySelector('select[name=granularity]'),
			startFilter = container.querySelector('select[name=start_filter]'),
			endFilter = container.querySelector('select[name=end_filter]');

		for(const filter of this.page.preview.report.filters.values()) {
			startFilter.insertAdjacentHTML('beforeend', `<option value="${filter.placeholder}">${filter.name}</option>`);
			endFilter.insertAdjacentHTML('beforeend', `<option value="${filter.placeholder}">${filter.name}</option>`);
		}

		if(!this.page.preview.report.filters.size) {
			startFilter.parentElement.classList.add('hidden');
			endFilter.parentElement.classList.add('hidden');
		}

		if(this.options.column)
			column.dataset.value = this.options.column;

		if(this.options.granularity)
			granularity.value = this.options.granularity;

		if(this.options.start_filter)
			startFilter.value = this.options.start_filter;

		if(this.options.end_filter)
			endFilter.value = this.options.end_filter;

		this.render();

		return super.container;
	}

	render() {

		const
			select = this.container.querySelector('select[name=column]'),
			value = select.value;

		select.textContent = null;

		for(const _column of this.incoming.columns.values())
			select.insertAdjacentHTML('beforeend', `<option value="${_column.key}">${_column.name}</option>`);

		select.value = value || select.dataset.value;
	}

	get json() {

		const response = super.json;

		response.options = {
			column: this.container.querySelector('[name=column]').value,
			granularity: this.container.querySelector('[name=granularity]').value,
			content: this.container.querySelector('[name=content]').value,
			start_filter: this.container.querySelector('[name=start_filter]').value,
			end_filter: this.container.querySelector('[name=end_filter]').value,
		};

		return response;
	}
});

ReportTransformation.types.set('stream', class ReportTransformationStream extends ReportTransformation {

	constructor(...parameters) {

		super(...parameters);

		this.visualizations = new MultiSelect({multiple: false});
	}

	get key() {
		return 'stream';
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		if(!this.page.preview.report.originalResponse)
			return;

		const
			container = super.container.querySelector('.transformation'),
			joins = document.createElement('div'),
			columns = document.createElement('div'),
			reports = [];

		joins.classList.add('joins');
		columns.classList.add('columns');

		joins.innerHTML = `<h4>Join On</h4>`;
		columns.innerHTML = `<h4>Columns</h4>`;

		for(const join of this.options.joins || [])
			joins.appendChild(this.join(join));

		const addJoin = document.createElement('button');

		addJoin.type = 'button';
		addJoin.innerHTML = `<i class="fa fa-plus"></i> Add New Join`;

		addJoin.on('click', () => {
			joins.insertBefore(this.join(), addJoin);
			this.render();
		});

		joins.appendChild(addJoin);

		for(const column of this.options.columns || [])
			columns.appendChild(this.column(column));

		const addColumn = document.createElement('button');

		addColumn.type = 'button';
		addColumn.innerHTML = `<i class="fa fa-plus"></i> Add New Column`;
		addColumn.on('click', () => columns.insertBefore(this.column(), addColumn));

		columns.appendChild(addColumn);

		container.innerHTML	= `
			<div class="visualization">
				<h4>Columns</h4>
			</div>
		`;

		const datalist = [];

		for(const [index, report] of DataSource.list.entries()) {

			for(const visualisation of report.visualizations) {

				if(visualisation.visualization_id && visualisation.visualization_id != this.stage.visualization.visualization_id) {

					datalist.push({
						'name': visualisation.name,
						'value': visualisation.visualization_id,
						'subtitle': `${report.name} #${report.query_id}`,
					});
				}
			}
		}

		this.visualizations.datalist = datalist;
		this.visualizations.render();

		this.visualizations.value = this.options.visualization_id;

		container.querySelector('.visualization').appendChild(this.visualizations.container);
		container.appendChild(joins);
		container.appendChild(columns);

		return super.container;
	}

	get json() {

		const response = super.json;

		response.options = {
			visualization_id: this.visualizations.value[0],
			joins: [],
			columns: [],
		};

		for(const join of this.container.querySelectorAll('.join')) {
			response.options.joins.push({
				sourceColumn: join.querySelector('select[name=sourceColumn]').value,
				function: join.querySelector('select[name=function]').value,
				streamColumn: join.querySelector('input[name=streamColumn]').value,
			});
		}

		for(const column of this.container.querySelectorAll('.column')) {
			response.options.columns.push({
				stream: column.querySelector('select[name=stream]').value,
				column: column.querySelector('input[name=column]').value,
				function: column.querySelector('select[name=function]').value,
				name: column.querySelector('input[name=name]').value,
			});
		}

		if(!response.options.columns.length) {
			return null;
		}

		return response;
	}

	join(join = {}) {

		const container = document.createElement('div');

		container.classList.add('form-row', 'join');

		container.innerHTML = `
			<select name="sourceColumn"></select>
			<select name="function"></select>
			<input type="text" name="streamColumn" placeholder="Stream Column">
		`;

		const
			sourceColumnSelect = container.querySelector('select[name=sourceColumn]'),
			functionSelect = container.querySelector('select[name=function]'),
			streamColumnInput = container.querySelector('input[name=streamColumn]');

		sourceColumnSelect.dataset.value = join.sourceColumn;

		for(const filter of DataSourceColumnFilter.types)
			functionSelect.insertAdjacentHTML('beforeend', `<option value="${filter.slug}">${filter.name}</option>`);

		functionSelect.value = join.function;

		streamColumnInput.value = join.streamColumn || '';

		container.insertAdjacentHTML('beforeend',`<button type="button"><i class="far fa-trash-alt"></i></button>`);

		container.querySelector('button').on('click', e => {
			e.stopPropagation();
			container.remove();
		});

		return container;
	}

	column(column = {}) {

		const container = document.createElement('div');

		container.classList.add('form-row', 'column');

		container.insertAdjacentHTML('beforeend',`
			<select name="stream">
				<option value="base">Base</option>
				<option value="stream">Stream</option>
			</select>
			<input type="text" name="column" value="${column.column || ''}" placeholder="Column">
			<select name="function">
				<option value="sum">Sum</option>
				<option value="count">Count</option>
				<option value="distinctcount">Distinct Count</option>
				<option value="values">Values</option>
				<option value="distinctvalues">Distinct Values</option>
				<option value="max">Max</option>
				<option value="min">Min</option>
				<option value="average">Average</option>
			</select>
			<input type="text" name="name" value="${column.name || ''}" placeholder="Name">
			<button type="button"><i class="far fa-trash-alt"></i></button>
		`);

		if(column.stream)
			container.querySelector('select[name=stream]').value = column.stream;

		if(column.function)
			container.querySelector('select[name=function]').value = column.function;

		container.querySelector('button').on('click', () => container.remove());

		return container;
	}

	render() {

		for(const select of this.container.querySelectorAll('select[name=sourceColumn]')) {

			const value = select.value;

			select.textContent = null;

			for(const column of this.incoming.columns.values())
				select.insertAdjacentHTML('beforeend', `<option value="${column.key}">${column.name}</option>`);

			select.value = value || select.dataset.value;
		}
	}
});

ReportTransformation.types.set('restrict-columns', class ReportTransformationRestrictColumns extends ReportTransformation {

	constructor(...parameters) {

		super(...parameters);

		this.multiSelect = new MultiSelect({multiple: true, expand: true});
	}

	get key() {
		return 'restrict-columns'
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const
			container = super.container.querySelector('.transformation'),
			columns = document.createElement('div'),
			label = document.createElement('label');

		columns.classList.add('columns');
		label.classList.add('restrict-columns');

		columns.appendChild(this.multiSelect.container);

		label.innerHTML = `
			<input type="checkbox" name="exclude" disabled>
			<span>Exclude</span>
		`;

		this.multiSelect.on('change', () => {
			label.querySelector('input').disabled = this.multiSelect.value.length ? false : true;
		});

		label.querySelector('input').checked = this.options.exclude || '';

		container.appendChild(columns);
		container.appendChild(label);

		this.render();

		return super.container;
	}

	render() {

		const
			datalist = [],
			value = this.multiSelect.value;

		for(const column of this.incoming.columns.values()) {

			datalist.push({
				name: column.name,
				value: column.key,
			});
		}

		this.multiSelect.datalist = datalist;
		this.multiSelect.render();

		this.multiSelect.value = value.length ? value : this.options.columns || [];
	}

	get json() {

		const response = super.json;

		response.options = {
			columns: this.multiSelect.value,
			exclude: this.container.querySelector('label input[name="exclude"]').checked,
		};

		return response;
	};
});

ReportTransformation.types.set('sort', class ReportTransformationSort extends ReportTransformation {

	get key() {
		return 'sort';
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		if(!this.page.preview.report.originalResponse)
			return;

		const container = super.container.querySelector('.transformation');

		container.classList.add('sort');
		container.textContent = null;

		for(const column of this.options.columns || [])
			container.appendChild(this.column(column));

		const addColumn = document.createElement('button');

		addColumn.type = 'button';
		addColumn.innerHTML = `<i class="fa fa-plus"></i> Add New Column`;

		addColumn.on('click', () => {
			container.insertBefore(this.column(), addColumn);
			this.render();
		});

		container.appendChild(addColumn);

		this.render();

		return super.container;
	}

	get json() {

		const response = super.json;

		response.options = {
			columns: [],
		};

		for(const column of this.container.querySelectorAll('.column')) {

			response.options.columns.push({
				column: column.querySelector('select[name=column]').value,
				order: column.querySelector('select[name=order]').value,
				numeric: column.querySelector('select[name=numeric]').value,
				caseFirst: column.querySelector('select[name=caseFirst]').value,
			});
		}

		if(!response.options.columns.length)
			return null;

		return response;
	}

	render() {

		for(const select of this.container.querySelectorAll('select[name=column]')) {

			const value = select.value;

			select.textContent = null;

			for(const column of this.incoming.columns.values())
				select.insertAdjacentHTML('beforeend', `<option value="${column.key}">${column.name}</option>`);

			select.value = value || select.dataset.value;
		}
	}

	column(column = {}) {

		const container = document.createElement('div');

		container.classList.add('form-row', 'column');

		container.innerHTML = `
			<label>
				<span>Column</span>
				<select name="column"></select>
			</label>

			<label>
				<span>Order</span>
				<select name="order">
					<option value="ascending">Ascending</option>
					<option value="descending">Descending</option>
				</select>
			</label>

			<label>
				<span>Numeric</span>
				<select name="numeric">
					<option value="">Default</option>
					<option value="numeric">Numeric</option>
					<option value="alphabetical">Alphabetical</option>
				</select>
			</label>

			<label>
				<span>Case First</span>
				<select name="caseFirst">
					<option value="">Default</option>
					<option value="upper">Upper Case</option>
					<option value="lower">Lower Case</option>
				</select>
			</label>


			<label>
				<span>&nbsp;</span>
				<button class="move-up"><i class="fas fa-angle-up"></i></button>
			</label>

			<label>
				<span>&nbsp;</span>
				<button class="move-down"><i class="fas fa-angle-down"></i></button>
			</label>

			<label>
				<span>&nbsp;</span>
				<button class="remove"><i class="far fa-trash-alt"></i></button>
			</label>
		`;

		const
			columnSelect = container.querySelector('select[name=column]'),
			order = container.querySelector('select[name=order]'),
			numeric = container.querySelector('select[name=numeric]'),
			caseFirst = container.querySelector('select[name=caseFirst]'),
			moveUp = container.querySelector('.move-up'),
			moveDown = container.querySelector('.move-down');

		moveUp.on('click', () => {

			if(container.previousSibling)
				container.parentElement.insertBefore(container, container.previousSibling);
		});

		moveDown.on('click', () => {

			if(container.nextSibling && container.nextSibling.classList.contains('column'))
				container.parentElement.insertBefore(container.nextSibling, container);
		});

		if(column.column)
			columnSelect.dataset.value = column.column;

		if(column.order)
			order.value = column.order;

		if(column.numeric)
			numeric.value = column.numeric;

		if(column.caseFirst)
			caseFirst.value = column.caseFirst;

		container.querySelector('.remove').on('click', e => {
			e.stopPropagation();
			container.remove();
		});

		return container;
	}
});

ReportTransformation.types.set('linear-regression', class ReportTransformationRestrictColumns extends ReportTransformation {

	constructor(...parameters) {

		super(...parameters);

		this.multiSelectX = new MultiSelect({multiple: false, expand: true});
		this.multiSelectY = new MultiSelect({multiple: false, expand: true});

		if (!this.options.columns) {

			this.options.columns = {
				x: '',
				y: '',
				extrapolate: 0
			}
		}

		if (!this.extrapolateUnits) {

			this.extrapolateUnits = document.createElement('input');
			this.extrapolateUnits.type = 'number';
			this.extrapolateUnits.min = 0;
			this.extrapolateUnits.step = 1;

			this.extrapolateUnits.value = this.options.columns.extrapolate || 0;
		}
	}

	get key() {

		return 'linear-regression';
	}

	get container() {

		if (this.containerElement) {

			return this.containerElement;
		}

		const container = super.container.querySelector('.transformation');


		const labelX = document.createElement('label');
		const spanX = document.createElement('span');
		spanX.textContent = 'Feature (X-Axis)';

		labelX.appendChild(spanX);
		labelX.appendChild(this.multiSelectX.container);

		const labelY = document.createElement('label');
		const spanY = document.createElement('span');
		spanY.textContent = 'Label (Y-Axis)';

		labelY.appendChild(spanY);
		labelY.appendChild(this.multiSelectY.container);

		container.appendChild(labelX);
		container.appendChild(labelY);
		container.appendChild(this.extrapolateUnits);

		this.render();

		return super.container;
	}

	render() {

		const
			datalist = [];

		for (const column of this.incoming.columns.values()) {

			datalist.push({
				name: column.name,
				value: column.key,
			});
		}

		this.multiSelectX.datalist = datalist;

		this.multiSelectX.render();

		if (this.options.columns.x && this.multiSelectX.datalist.filter(x => x.value == this.options.columns.x)) {

			this.multiSelectX.value = this.options.columns.x;
		}

		this.multiSelectY.datalist = JSON.parse(JSON.stringify(datalist)).filter(x => x.value != this.options.columns.x);

		this.multiSelectY.render();

		if (this.options.columns.y && this.multiSelectY.datalist.filter(x => x.value == this.options.columns.y)) {

			this.multiSelectY.value = this.options.columns.y;
		}

		this.multiSelectX.on('change', () => {

			if (!(this.multiSelectX.value && this.multiSelectX.value.length)) {

				return;
			}

			const multiselectXValue = this.multiSelectX.value;
			this.multiSelectY.datalist = this.multiSelectX.datalist.filter(x => x.value != multiselectXValue);

			this.multiSelectY.render();
			this.multiSelectY.value = this.multiSelectY.value || this.options.columns.y;

		});
	}

	get json() {

		const
			value = this.multiSelectY.value[0],
			response = super.json;

		response.options = {
			columns: {
				x: this.multiSelectX.value[0],
				y: this.multiSelectY.value[0],
				name: value ? (this.multiSelectY.datalist.filter(x => value == x.value))[0].name : '',
				extrapolate: this.extrapolateUnits.value
			},
		};

		return response;
	}
});

ReportTransformation.types.set('custom-column', class ReportTransformationMultipleColumn extends ReportTransformation {

	get key() {
		return 'custom-column';
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = super.container.querySelector('.transformation');

		container.innerHTML = `

			<label>
				<span>Column Name</span>
				<input type="text" name="column" value="${this.options.column || ''}">
			</label>

			<label>
				<span>Formula</span>
				<textarea name="formula">${this.options.formula || ''}</textarea>
				<small class="error"></small>
			</label>
		`;

		container.querySelector('textarea[name=formula]').on('keyup', () => this.render());
		container.querySelector('textarea[name=formula]').on('change', () => this.render());

		this.render();

		return super.container;
	}

	render() {

		const textarea = this.container.querySelector('textarea[name=formula]');

		let formula = textarea.value;

		for(const column of this.incoming.columns.values()) {

			if(formula.includes(`{{${column.key}}}`))
				formula = formula.replace(new RegExp(`{{${column.key}}}`, 'gi'), 1);
		}

		try {
			eval(formula);
		}

		catch(e) {

			textarea.parentElement.querySelector('small').textContent = e.message;
			textarea.parentElement.querySelector('small').classList.remove('hidden');

			return;
		}

		textarea.parentElement.querySelector('small').innerHTML = '&nbsp;';
		textarea.parentElement.querySelector('small').classList.add('hidden');
	}

	get json() {

		const response = super.json;

		response.options = {
			type: this.key,
			column: this.container.querySelector('label input[name="column"]').value,
			formula: this.container.querySelector('label textarea[name="formula"]').value,
		};

		return response;
	}
});

class ReportVisualizationDashboards extends Set {

	constructor(stage) {

		super();

		this.stage = stage;
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');
		container.classList.add('configuration-section', 'dashboards');

		container.innerHTML = `
			<h3><i class="fas fa-angle-right"></i> Dashboards <span class="count"></span></h3>

			<div class="body">

				<div class="list"></div>

				<form class="add-dashboard">

					<fieldset>
						<legend>Add To Dashboard</legend>

						<div class="form">

							<label class="dashboard_id">
								<span>Dashboard <span class="red">*</span></span>
							</label>

							<label>
								<span>Position</span>
								<input name="position" type="number">
							</label>

							<label>
								<span>Width</span>
								<input type="number" name="width" min="1" step="1" placeholder="32">
							</label>

							<label>
								<span>Height</span>
								<input type="number" name="height" min="1" step="1" placeholder="10">
							</label>

							<label class="save">
								<span>&nbsp;</span>
								<button type="submit" title="Submit"><i class="fa fa-paper-plane"></i></button>
							</label>

							<label class="create-new">
								<span>&nbsp;</span>
								<button type="button" disabled title="Create New Dashboard"><i class="fas fa-external-link-alt"></i> Create New</button>
							</label>
						</div>
					</fieldset>
				</form>
			</div>
		`;

		if(user.privileges.has('dashboard.insert')) {

			this.container.querySelector('.create-new button').disabled = false;

			this.container.querySelector('.create-new').on('click', () => {
				window.open('/dashboards-manager/add');
			})
		}
		this.container.querySelector('form').on('submit', e => ReportVisualizationDashboards.insert(e, this.stage));

		this.dashboardMultiSelect = new MultiSelect({multiple: false, dropDownPosition: 'top'});
		this.container.querySelector('.add-dashboard .dashboard_id').appendChild(this.dashboardMultiSelect.container);

		return container;
	}

	async load(options) {

		await this.fetch(options);

		this.process();

		this.render();
	}

	async fetch({force = false} = {}) {

		if(ReportVisualizationDashboards.response && !force)
			return this.response = ReportVisualizationDashboards.response;

		ReportVisualizationDashboards.response = this.response = await API.call('dashboards/list');
	}

	process() {

		this.response = new Map(this.response.map(d => [d.id, d]));

		this.clear();

		for(const dashboard of this.response.values()) {

			if(!dashboard.format)
				dashboard.format = {};

			for(const report of dashboard.visualizations || []) {

				if(this.stage.visualization.visualization_id == report.visualization_id)
					this.add(new ReportVisualizationDashboard(dashboard, this.stage));
			}
		}
	}

	render() {

		const dashboardsList = this.container.querySelector('.list');

		dashboardsList.textContent = null;

		for(const dashboard of this)
			dashboardsList.appendChild(dashboard.form);

		if(!this.size)
			dashboardsList.innerHTML = '<div class="NA">No dashboard added yet!</div>';

		this.container.querySelector('h3 .count').innerHTML = `${this.size ? 'Added to ' + this.size + ' dashboard' + (this.size == 1 ? '' : 's') : ''}` ;

		const datalist = [];

		if(this.response) {

			for(const dashboard of this.response.values()) {

				if(!dashboard.editable)
					continue;

				const
					parents = [],
					seen = [];

				let parent = dashboard.parent;

				while(parent) {

					if(!this.response.has(parent) || seen.includes(parent))
						break;

					const parentDashboard = this.response.get(parent);

					parents.push(`${parentDashboard.name} #${parentDashboard.id}`);
					seen.push(parentDashboard.id);

					parent = parentDashboard.parent;
				}

				datalist.push({
					value: dashboard.id,
					name: dashboard.name,
					subtitle: parents.reverse().join(' &rsaquo; '),
				});
			}
		}

		if(!datalist.length) {
			this.container.querySelector('fieldset .form').innerHTML = '<div class="NA">No Dashboard Found</div>'
		}
		else {
			this.dashboardMultiSelect.datalist = datalist;
			this.dashboardMultiSelect.render();
		}
	}

	clear() {

		super.clear();
		this.container.querySelector('.list').innerHTML = '<div class="NA">Loading&hellip;</div>';
	}

	static async insert(e, stage) {

		e.preventDefault();

		const
			form = stage.dashboards.container.querySelector('.add-dashboard'),
			dashboard_id = parseInt(stage.dashboards.dashboardMultiSelect.value[0]);

		if(!dashboard_id) {

			return new SnackBar({
				message: 'Selecting a dashboard is required.',
				type: 'warning',
			});
		}

		if(Array.from(stage.dashboards).some(d => d.id == dashboard_id)) {

			return new SnackBar({
				message: 'Visualization Already Added',
				subtitle: `${stage.dashboards.response.get(dashboard_id).name} #${dashboard_id}`,
				type: 'warning',
			});
		}

		const
			option = {
				method: 'POST',
			},
			parameters = {
				owner: 'dashboard',
				owner_id: dashboard_id,
				visualization_id: stage.visualization.visualization_id,
				format: JSON.stringify({
					position: parseInt(form.position.value),
					width: Math.max(parseInt(form.width.value), 1),
					height: Math.max(parseInt(form.height.value), 1),
				}),
			};

		try {

			await API.call('reports/dashboard/insert', parameters, option);

			await stage.dashboards.load({force: true});

			new SnackBar({
				message: 'Visualization Added to Dashboard',
				subtitle: `${stage.dashboards.response.get(dashboard_id).name} #${dashboard_id}`,
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

		form.reset();
		stage.dashboards.dashboardMultiSelect.clear();
	}
}

class ReportVisualizationDashboard {

	constructor(dashboard, stage) {

		this.stage = stage;

		for(const key in dashboard)
			this[key] = dashboard[key];

		[this.visualization] = this.visualizations.filter(v => v.visualization_id == this.stage.visualization.visualization_id);
	}

	get form() {

		if(this.formContainer)
			return this.formContainer;

		const form = this.formContainer = document.createElement('form');

		form.classList.add('subform', 'form');

		form.innerHTML = `
			<label class="dashboard_id">
				<span>Dashboard</span>
			</label>

			<label>
				<span>Position</span>
				<input type="number" name="position" value="${this.visualization.format.position || ''}">
			</label>

			<label>
				<span>Width</span>
				<input type="number" name="width" min="1" step="1" value="${this.visualization.format.width || ''}" placeholder="32">
			</label>

			<label>
				<span>Height</span>
				<input type="number" name="height" min="1" step="1" value="${this.visualization.format.height || ''}" placeholder="10">
			</label>

			<label class="save">
				<span>&nbsp;</span>
				<button type="submit" title="Save"><i class="far fa-save"></i></button>
			</label>

			<label>
				<span>&nbsp;</span>
				<button type="button" class="delete" title="Delete"><i class="far fa-trash-alt"></i></button>
			</label>

			<label>
				<span>&nbsp;</span>
				<button type="button" class="view-dashboard" title="View Dashboard"><i class="fas fa-external-link-alt"></i></button>
			</label>
		`;

		const datalist = [];
		let selectedDashboard;

		if(this.stage.dashboards.response) {

			for(const dashboard of this.stage.dashboards.response.values()) {

				if(dashboard.id == this.visualization.owner_id) {
					selectedDashboard = dashboard.name;
				}

				if(!dashboard.editable)
					continue;

				const
					parents = [],
					seen = [];

				let parent = dashboard.parent;

				while(parent) {

					if(!this.stage.dashboards.response.has(parent) || seen.includes(parent))
						break;

					const parentDashboard = this.stage.dashboards.response.get(parent);

					parents.push(`${parentDashboard.name} #${parentDashboard.id}`);
					seen.push(parentDashboard.id);

					parent = parentDashboard.parent;
				}

				datalist.push({
					value: dashboard.id,
					name: dashboard.name,
					subtitle: parents.reverse().join(' &rsaquo; '),
				});
			}
		}

		this.dashboardMultiSelect = new MultiSelect({datalist, multiple: false, dropDownPosition: 'top'});

		this.dashboardMultiSelect.value = this.visualization.owner_id;

		if(this.dashboardMultiSelect.value.length) {

			form.querySelector('.view-dashboard').on('click', () => window.open('/dashboard/' + this.dashboardMultiSelect.value[0]));

			form.querySelector('.dashboard_id').appendChild(this.dashboardMultiSelect.container);
		}
		else {

			const input = document.createElement('input');
			input.value = selectedDashboard;
			input.disabled = true;

			form.position.disabled = true;

			form.querySelector('.view-dashboard').disabled = true;
			form.querySelector('.save button').disabled = true;
			form.querySelector('.delete').disabled = true;

			form.querySelector('.dashboard_id').appendChild(input);
		}

		form.querySelector('.delete').on('click', () => this.delete());

		form.on('submit', async e => {
			e.preventDefault();
			this.update();
		});

		return form;
	}

	async delete() {

		if(!confirm('Are you sure?'))
			return;

		const
			option = {
				method: 'POST',
			},
			parameters = {
				id: this.visualization.id,
			};

		try {

			await API.call('reports/dashboard/delete', parameters, option);

			await this.stage.dashboards.load({force: true});

			new SnackBar({
				message: 'Dashboard Deleted',
				subtitle: `${this.stage.dashboards.response.get(this.visualization.owner_id).name} #${this.visualization.owner_id}`,
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

	async update() {

		if(!this.dashboardMultiSelect.value[0]) {

			return new SnackBar({
				message: 'Selecting a dashboard is required.',
				type: 'warning',
			});
		}

		this.visualization.format.position = parseInt(this.form.position.value);
		this.visualization.format.width = Math.max(parseInt(this.form.width.value), 1);
		this.visualization.format.height = Math.max(parseInt(this.form.height.value), 1);

		const
			option = {
				method: 'POST',
			},
			parameters = {
				id: this.visualization.id,
				owner: 'dashboard',
				owner_id: this.dashboardMultiSelect.value[0],
				visualization_id: this.visualization.visualization_id,
				format: JSON.stringify(this.visualization.format)
			};

		try {

			await API.call('reports/dashboard/update', parameters, option);

			await this.stage.dashboards.load({force: true});

			new SnackBar({
				message: 'Dashboard Saved',
				subtitle: `${this.stage.dashboards.response.get(this.visualization.owner_id).name} #${this.visualization.owner_id}`,
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
}

class ReportVisualizationFilters extends Map {

	constructor(visualization, stage) {

		super();

		this.visualization = visualization;
		this.stage = stage;
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');
		container.classList.add('configuration-section', 'filters');

		container.innerHTML = `
			<h3><i class="fas fa-angle-right"></i> Filters <span class="count"></span></h3>
			<div class="body">
				<div class="list" class="list"></div>
				<form class="add-filter">
					<fieldset>
						<legend>Add Filter</legend>

						<div class="form">

							<label>
								<span>Name</span>
								<select></select>
							</label>

							<label>
								<span>&nbsp;</span>
								<button type="submit"><i class="fa fa-plus"></i> Add</button>
							</label>
						</div>
					</fieldset>
				</form>
			</div>
		`;

		this.container.querySelector('.add-filter').on('submit', (e) => {

			e.preventDefault();

			const
				filterOptions = this.container.querySelector('.add-filter select'),
				[filter] = this.stage.report.filters.filter(x => x.filter_id == parseInt(filterOptions.value));

			this.set(filter.filter_id, new ReportVisualizationFilter(
				{filter_id: filter.filter_id, default_value: ''},
				filter,
				this,
			));

			this.render();
		});

		return container;
	}

	load() {

		this.process();

		this.render();
	}

	process() {

		this.clear();

		if(!this.visualization.options)
			return;

		for(const filter of this.visualization.options.filters || []) {

			const [filterObj] = this.stage.report.filters.filter(x => x.filter_id == filter.filter_id);

			if(!filterObj)
				continue;

			this.set(filter.filter_id, new ReportVisualizationFilter(filter, filterObj, this));
		}
	}

	render() {

		const filterList = this.container.querySelector('.list');

		filterList.textContent = null;

		if(!this.stage.report.filters.length) {

			filterList.innerHTML = '<div class="NA">No filters found!</div>';
			this.container.querySelector('.add-filter').classList.add('hidden');

			return;
		}

		this.container.querySelector('.add-filter').classList.remove('hidden');

		for(const filter of this.values())
			filterList.appendChild(filter.container);

		if(!this.size)
			filterList.innerHTML = '<div class="NA">No filters added yet!</div>';

		const optionsList = this.container.querySelector('.add-filter select');

		optionsList.textContent = null;

		for(const filter of this.stage.report.filters) {

			if(!this.has(filter.filter_id))
				optionsList.insertAdjacentHTML('beforeend', `<option value="${filter.filter_id}">${filter.name}</option>`);
		}

		this.container.querySelector('.add-filter').classList.toggle('hidden', this.size == this.stage.report.filters.length);

		this.container.querySelector('h3 .count').innerHTML = `
			${this.size ? this.size + ' filter' + (this.size == 1 ? ' added' : 's added') : ''}
		`;
	}

	get json() {

		const response = [];

		for(const filter of this.values()) {

			response.push(filter.json);
		}

		return response;
	}

	clear() {

		super.clear();
		this.container.querySelector('.list').innerHTML = `<div class="NA">Loading&hellip;</div>`;
	}
}

class ReportVisualizationFilter {

	constructor(filter, reportFilter, filters) {

		this.reportVisualizationFilters = filters;
		this.reportFilter = reportFilter;

		filter.type = reportFilter.type;

		Object.assign(this, filter);

		this.form = new DataSourceFilterForm(filter);
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('fieldset');

		container.innerHTML = `
			<legend>${this.reportFilter.name}</legend>
		`;

		container.appendChild(this.form.container);

		this.form.container.insertAdjacentHTML('beforeend', `

			<label>
				<button type="button" class="delete" title="Delete"><i class="far fa-trash-alt"></i></button>
			</label>
		`);

		this.form.container.name.parentElement.classList.add('hidden');
		this.form.container.order.parentElement.classList.add('hidden');
		this.form.container.placeholder.parentElement.classList.add('hidden');
		this.form.container.type.parentElement.classList.add('hidden');
		this.form.container.description.parentElement.classList.add('hidden');
		this.form.datasetMultiSelect.container.parentElement.classList.add('hidden');

		let default_value = this.reportFilter.default_value;

		if(this.reportFilter.offset && this.reportFilter.offset.length) {
			default_value = Format.number(this.reportFilter.offset.length) + ' offset rule' + (this.reportFilter.offset > 1 ? 's' : '');
		}

		if(default_value) {
			this.form.container.default_type.insertAdjacentHTML('beforebegin', `<small>From Report: ${default_value}</small>`);
		}

		container.querySelector('label .delete').on('click', () => {

			this.container.parentElement.removeChild(container);

			this.reportVisualizationFilters.delete(this.filter_id);
			this.reportVisualizationFilters.render();
		});

		return container;
	}

	get json() {

		const json = this.form.json;

		delete json.placeholder;

		return {
			filter_id: this.reportFilter.filter_id,
			name: json.name,
			order: json.order,
			default_value: json.default_value,
			offset: json.offset,
		};
	}
}

class RelatedVisualizations extends Set {

	constructor(stage) {

		super();

		this.stage = stage;
	}

	get container() {

		if(this.containerElement) {

			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');
		container.classList.add('configuration-section', 'related-visualizations');

		container.innerHTML = `
			<h3><i class="fas fa-angle-right"></i> Related Visualizations <span class="count"></span></h3>

			<div class="body">

				<div class="list"></div>

				<form class="add">

					<fieldset>

						<legend>Add Related Visualizations</legend>

						<div class="form">

							<label class="visualization">
								<span>Visualizations</span>
							</label>

							<label>
								<span>Position</span>
								<input name="position" type="number" class="item" placeholder="1">
							</label>

							<label>
								<span>Width</span>
								<input name="width" min="2" type="number" step="1" class="item" placeholder="32" max="32">
							</label>

							<label>
								<span>Height</span>
								<input name="height" min="1" type="number" step="1" class="item" placeholder="10" max="10">
							</label>

							<label>
								<span>&nbsp;</span>
								<button type="submit"><i class="fa fa-plus"></i> Add</button>
							</label>

						</div>
					</fieldset>
				</form>
			</div>
		`;

		this.container.querySelector('form').on('submit', e => {

			e.preventDefault();
			this.insert()
		});

		this.relatedVisualizationsMultiSelect = new MultiSelect({multiple: false, dropDownPosition: 'top'});
		this.container.querySelector('.add .visualization').appendChild(this.relatedVisualizationsMultiSelect.container);

		return container;
	}

	async load(force = false) {

		await this.fetch(force);

		this.process();

		this.render();

		if(force) {

			await this.stage.page.preview.load({
				query_id: this.stage.report.query_id,
				visualization: {
					id: this.stage.visualization.visualization_id
				},
			});
		}
	}

	async fetch(force = false) {

		await DataSource.load(force);
	}

	process() {

		this.clear();

		this.possibleVisualizations = [];

		[...DataSource.list.values()].map(x =>
			this.possibleVisualizations.push(...x.visualizations.filter(
				v => v.visualization_id && v.visualization_id != this.stage.visualization.visualization_id
			))
		);

		const visualizationMap = new Map(DataSource.list.get(this.stage.visualization.query_id).visualizations.map(x => [x.visualization_id, x]));

		for(const visualization of visualizationMap.get(this.stage.visualization.visualization_id).related_visualizations) {

			this.add(new RelatedVisualization(visualization, this));
		}
	}

	render() {

		const relatedVisualizationsList = this.container.querySelector('.list');

		relatedVisualizationsList.textContent = null;

		for(const visualization of this) {

			relatedVisualizationsList.appendChild(visualization.form);
		}

		if(!this.size)
			relatedVisualizationsList.innerHTML = '<div class="NA">No sub visualizations added yet!</div>';

		this.container.querySelector('h3 .count').innerHTML = `${this.size ? this.size + ' related visualization' + (this.size == 1 ? '' : 's') + ' added' : ''}` ;

		const datalist = this.possibleVisualizations.map(v => ({
			value: v.visualization_id,
			name: v.name,
			subtitle: `${v.type} &nbsp;&middot;&nbsp; ${DataSource.list.get(v.query_id).name} #${v.query_id}`,
		}));

		if(!datalist.length) {

			this.container.querySelector('fieldset .form').innerHTML = '<div class="NA">No Related Visualizations Found</div>';
		}
		else {

			this.relatedVisualizationsMultiSelect.datalist = datalist;
			this.relatedVisualizationsMultiSelect.render();
		}
	}

	async insert() {

		const
			form = this.container.querySelector('.add'),
			visualization_id = parseInt(this.relatedVisualizationsMultiSelect.value[0]);

		if(Array.from(this).some(d => d.visualization_id == visualization_id)) {

			new SnackBar({
				message: 'Visualization Already Added',
				subtitle: `#${visualization_id}`,
				type: 'warning',
			});

			return;
		}

		if(!visualization_id) {

			return new SnackBar({
				message: 'Visualization Id cannot be empty',
				type: 'warning'
			})
		}

		const
			option = {
				method: 'POST',
			},
			parameters = {
				owner: 'visualization',
				owner_id: this.stage.visualization.visualization_id,
				visualization_id: visualization_id,
				format: JSON.stringify({
					position: parseInt(form.position.value) || 1,
					width: parseInt(form.width.value) || 32,
					height: parseInt(form.height.value) || 10
				})
			};

		try {

			await API.call('reports/dashboard/insert', parameters, option);

			await this.load(true);

			new SnackBar({
				message: 'Related Visualization Added',
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

		form.reset();
		this.relatedVisualizationsMultiSelect.clear();
	}
}

class RelatedVisualization {

	constructor(visualization, relatedVisualizations) {

		Object.assign(this, visualization);

		try {

			this.format = typeof this.format == 'object' ? this.format || {} : JSON.parse(this.format);
		}
		catch(e) {

			this.format = {};
		}

		this.relatedVisualizations = relatedVisualizations;
	}

	get form() {

		if(this.formContainer){

			return this.formContainer;
		}

		const form = this.formContainer = document.createElement('form');

		form.classList.add('subform', 'form');

		form.innerHTML = `
			<label class="visualization">
				<span>Visualization</span>
			</label>

			<label>
				<span>Position</span>
				<input type="number" name="position" value="${this.format.position || ''}" class="item" placeholder="1">
			</label>

			<label>
				<span>Width</span>
				<input name="width" type="number" min="2" value="${this.format.width || ''}" class="item" placeholder="32" step="1" max="32">
			</label>

			<label>
				<span>Height</span>
				<input name="height" type="number" min="1" value="${this.format.height || ''}" class="item" placeholder="10" step="1" max="10">
			</label>

			<label class="save">
				<span>&nbsp;</span>
				<button type="submit" title="Save"><i class="far fa-save"></i></button>
			</label>

			<label>
				<span>&nbsp;</span>
				<button type="button" class="delete" title="Delete"><i class="far fa-trash-alt"></i></button>
			</label>
		`;

		const datalist = this.relatedVisualizations.possibleVisualizations.map(v => ({
			value: v.visualization_id,
			name: v.name,
			subtitle: `${v.type} &nbsp;&middot;&nbsp; ${DataSource.list.get(v.query_id).name} #${v.query_id}`,
		}));

		this.relatedMultiSelect = new MultiSelect({datalist, multiple: false, dropDownPosition: 'top'});
		form.querySelector('.visualization').appendChild(this.relatedMultiSelect.container);

		this.relatedMultiSelect.value = this.visualization_id;

		form.querySelector('.delete').on('click', async () => {

			await this.delete();
		});

		form.on('submit', async e => {

			e.preventDefault();
			await this.update();
		})

		return form;
	}

	async delete() {

		if(!confirm('Are you sure?'))
			return;

		const
			option = {
				method: 'POST',
			},
			parameters = {
				id: this.id,
			};

		try {

			await API.call('reports/dashboard/delete', parameters, option);

			await this.relatedVisualizations.load(true);

			new SnackBar({
				message: 'Related Visualization Deleted',
				subtitle: `#${this.id}`,
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

	async update() {

		const visualization_id = this.relatedMultiSelect.value[0];

		if(!visualization_id) {

			return new SnackBar({
				message: 'Selecting a visualization is required.',
				type: 'warning'
			});
		}

		this.format = {
			position: this.form.position.value || 1,
			width: this.form.width.value || 32,
			height: this.form.height.value || 10
		};

		const
			option = {
				method: 'POST',
			},
			parameters = {
				id: this.id,
				owner: 'visualization',
				owner_id: this.owner_id,
				visualization_id: visualization_id,
				format: JSON.stringify(this.format)
			};

		try {

			await API.call('reports/dashboard/update', parameters, option);

			await this.relatedVisualizations.load(true);

			new SnackBar({
				message: 'Related Visualization Saved',
				subtitle: `#${visualization_id}`,
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
}