class ReportsManger extends Page {

	constructor(page, key) {

		super(page, key);

		this.stages = new Map;
		this.preview = new ReportsMangerPreview(this);

		this.setup();
	}

	async setup() {

		this.stages.clear();

		this.stages.container = this.container.querySelector('#stages');

		const switcher = this.container.querySelector('#stage-switcher');

		for(const [key, stageClass] of ReportsManger.stages) {

			const stage = new stageClass(this, key);

			switcher.appendChild(stage.switcher);

			this.stages.set(key, stage);
		}

		window.on('popstate', () => this.load());

		await this.fetch();

		this.process();
		this.load();
	}

	async fetch() {

		[this.connections] = await Promise.all([
			API.call('credentials/list'),
			DataSource.load(true),
		]);
	}

	process() {

		const connections = new Map;

		for(const connection of this.connections) {

			for(const feature of MetaData.features.values()) {

				if(feature.slug == connection.type && feature.type == 'source')
					connection.feature = feature;
			}

			if(!connection.feature)
				continue;

			connections.set(connections.id, connection);
		}
		this.connections = new Map(this.connections.map(c => [c.id, c]));

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
				key: 'Connection name',
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
				key: 'Tags',
				rowValue: row => row.tags ? row.tags.split(',').map(t => t.trim()) : [],
			},
			{
				key: 'Filters Length',
				rowValue: row => [row.filters.length]
			},
			{
				key: 'Filters Name',
				rowValue: row => row.filters.map(f => f.name),
			},
			{
				key: 'Filters Placeholder',
				rowValue: row => row.filters.map(f => f.placeholder),
			},
			{
				key: 'Visualizations Name',
				rowValue: row => row.visualizations.map(f => f.name),
			},
			{
				key: 'Visualizations Type',
				rowValue: row => {
					return row.visualizations.map(f => f.type)
											 .map(m => MetaData.visualizations.has(m) ?
											 (MetaData.visualizations.get(m)).name : []);
				},
			},
			{
				key: 'Visualizations Length',
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
			data: Array.from(DataSource.list.values()),
			filters: filters,
			advanceSearch: true,
			page,
		});

		this.container.querySelector('#stages .section').insertBefore(this.searchBar.container, this.container.querySelector('#stages .section #list-container'));

		this.container.querySelector('#stages .section .toolbar').appendChild(this.searchBar.globalSearch.container);

		this.container.querySelector('#stages .section .toolbar').on('submit', e => e.preventDefault());

		this.searchBar.on('change', () => this.stages.get('pick-report').load() );
	}

	async load() {

		let stage = null;

		for(const [key, _stage] of this.stages) {
			if(window.location.pathname.includes(`/${key}`))
				stage = _stage;
		}

		if(stage)
			stage.select();

		else {

			stage = this.stages.get('pick-report');

			history.replaceState({}, '', `/reports/${stage.url}`);

			stage.select();
		}
	}
}

window.addEventListener('beforeunload', function (event) {

	event.preventDefault();

	if(this.page.stages.get('define-report').container.querySelector('button.not-saved'))
		event.returnValue = 'Sure';
});

class ReportsMangerPreview {

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

		try {
			await this.report.visualizations.selected.load();
		} catch(e) {}

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

class ReportsMangerStage {

	constructor(page, key) {

		this.page = page;
		this.key = key;

		try {

			this.page.onboard = JSON.parse(onboard)
		}
		catch(e) {}

		this.container = this.page.container.querySelector(`#stage-${this.key}`);
	}

	get switcher() {

		if(this.switcherContainer)
			return this.switcherContainer;

		const container = this.switcherContainer = document.createElement('div');

		container.classList.add('stage');

		container.innerHTML = `
			<span class="order">${this.order}</span>
			<span class="title">${this.title}</span>
			<small>${this.description}</small>
		`;

		container.on('click', () => {

			if(this.disabled)
				return;

			this.select();

			if(this.page.stages.get('define-report').container.querySelector('button.not-saved'))
				return;

			if(this.key != 'configure-visualization')
				window.history.pushState({}, '', `/reports/${this.url}`);
		});

		return container;
	}

	async select() {

		if(!this.page.stages.get('define-report').saveReportConfirm())
			return;

		if(this.page.stages.selected)
			this.page.stages.selected.switcher.classList.remove('selected');

		this.switcher.classList.add('selected');

		Sections.show(this.container.id);

		this.page.stages.selected = this;

		const
			reportName = this.page.stages.get('pick-report').switcher.querySelector('small'),
			visualizationsName = this.page.stages.get('pick-visualization').switcher.querySelector('small'),
			report = this.selectedReport;

		if(report) {

			reportName.textContent = report ? `${report.name} #${report.query_id}` : 'Add New Report';

			let visualization,
				id = parseInt(location.pathname.split('/').pop())

			if(this.page.stages.get('configure-visualization').lastSelectedVisualizationId)
				id = this.page.stages.get('configure-visualization').lastSelectedVisualizationId;

			if(id)
				[visualization] = report.visualizations.filter(v => v.visualization_id == id)

			visualizationsName.textContent = visualization ? `${visualization.name} #${visualization.visualization_id}` : 'Add or Edit a Visualization';
		}

		this.load();
	}

	set disabled(disabled) {

		this._disabled = disabled;

		this.switcher.classList.toggle('disabled', disabled);
	}

	get disabled() {
		return this._disabled;
	}

	get selectedReport() {

		let report = null;

		const id = parseInt(location.pathname.split('/').pop());

		if(location.pathname.includes('/configure-visualization')) {

			for(const _report of DataSource.list.values()) {

				if(_report.visualizations.some(v => v.visualization_id == id))
					report = JSON.parse(JSON.stringify(_report));
			}
		}

		else if(DataSource.list.has(id))
			report = JSON.parse(JSON.stringify(DataSource.list.get(id)));

		if(report) {

			const connection = this.page.connections.get(parseInt(report.connection_name));

			if(!connection)
				throw new Page.exception('Report connection not found!');

			if(!ReportConnection.types.has(connection.type))
				throw new Page.exception('Invalid report connection type!');

			report.connection = new (ReportConnection.types.get(connection.type))(report, this);
		}

		return report;
	}
}

Page.class = ReportsManger;

ReportsManger.stages = new Map;

ReportsManger.stages.set('pick-report', class PickReport extends ReportsMangerStage {

	constructor(page, key) {

		super(page, key);

		this.order = '1';
		this.title = 'Pick Report';
		this.description = 'Pick a Report';

		this.sort = {};

		this.prepareSearch();

		if(user.privileges.has('report.insert')) {

			this.container.querySelector('#add-report').classList.remove('grey');

			this.container.querySelector('#add-report').on('click', () => {
				this.add();
				window.history.pushState({id: 'add'}, '', `/reports/configure-report/add`);
			});
		}
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
				<td class="action visualizations green" title="${report.visualizations.map(f => f.name).join(', ')}" >
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

					window.history.pushState({}, '', `/reports/configure-report/${report.query_id}`);

					this.page.stages.get('configure-report').disabled = false;
					this.page.stages.get('define-report').disabled = false;
					this.page.stages.get('pick-visualization').disabled = false;

					this.page.load();
				});
			}

			if(row.querySelector('.define.green')) {
				row.querySelector('.define').on('click', () => {

					window.history.pushState({}, '', `/reports/define-report/${report.query_id}`);

					this.page.stages.get('configure-report').disabled = false;
					this.page.stages.get('define-report').disabled = false;
					this.page.stages.get('pick-visualization').disabled = false;

					this.page.load();
				});
			}

			if(row.querySelector('.visualizations.green')) {
				row.querySelector('.visualizations').on('click', () => {

					window.history.pushState({}, '', `/reports/pick-visualization/${report.query_id}`);

					this.page.stages.get('configure-report').disabled = false;
					this.page.stages.get('define-report').disabled = false;
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

		window.history.pushState({}, '', `/reports/configure-report/add`);

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

ReportsManger.stages.set('configure-report', class ConfigureReport extends ReportsMangerStage {

	constructor(page, key) {

		super(page, key);

		this.order = '2';
		this.title = 'Configure Report';
		this.description = 'Change the report\'s properties';

		this.form = this.container.querySelector('form');
		this.form.save = this.container.querySelector('.toolbar button[type=submit]');
		this.shareContainer = this.container.querySelector('#share-report');

		this.descriptionEditor = new HTMLEditor();

		this.form.querySelector('.description').appendChild(this.descriptionEditor.container);

		for(const element of this.form.elements)
			element.on('change', () => this.form.save.classList.add('unsaved'));

		this.form.redis.on('change', () => {

			this.form.redis_custom.classList.toggle('hidden', this.form.redis.value != 'custom');

			if(!this.form.redis_custom.classList.contains('hidden'))
				this.form.redis_custom.focus();
		});
	}

	get url() {
		return `${this.key}/${this.report.query_id}`;
	}

	async load() {

		if(!this.form.connection_name.children.length) {

			for(const connection of this.page.connections.values()) {
				this.form.connection_name.insertAdjacentHTML('beforeend',
					`<option value="${connection.id}">${connection.connection_name} (${connection.feature.name})</option>`
				)
			}
		}

		this.form.subtitle.textContent = null;

		for(const category of MetaData.categories.values()) {

			this.form.subtitle.insertAdjacentHTML('beforeend', `
				<option value="${category.category_id}">${category.name}</option>
			`);
		}

		this.report = this.selectedReport;

		this.report ? this.edit() : this.add();
	}

	async add() {

		this.form.removeEventListener('submit', this.form.listener);
		this.form.on('submit', this.form.listener = e => this.insert(e));

		this.form.reset();
		this.form.save.classList.remove('unsaved');
		this.shareContainer.innerHTML = `<div class="NA">You can share the dashboard once the report is added.</div>`;

		this.container.querySelector('#added-by').textContent = null;

		this.form.redis_custom.classList.toggle('hidden', this.form.redis.value == 'custom');

		await this.descriptionEditor.setup(),

		this.descriptionEditor.value = '';

		this.form.name.focus();
	}

	async insert(e) {

		e.preventDefault();

		this.form.elements.tags.value = this.form.elements.tags.value.split(',').map(t => t.trim()).filter(t => t).join(', ');

		const
			parameters = {
				description: this.descriptionEditor.value,
				is_redis: this.form.redis.value == 'custom' ? this.form.redis_custom.value : this.form.redis.value,
			},
			options = {
				method: 'POST',
				form: new FormData(this.form),
			};

		try {

			const response = await API.call('reports/report/insert', parameters, options);

			await DataSource.load(true);

			window.history.replaceState({}, '', `/reports/define-report/${response.insertId}`);

			this.page.load();
			this.page.stages.get('configure-report').disabled = false;
			this.page.stages.get('define-report').disabled = false;
			this.page.stages.get('pick-visualization').disabled = false;

			if(await Storage.get('newUser'))
				await UserOnboard.setup();

			new SnackBar({
				message: 'New Report Added',
				subtitle: `${this.form.name.value} #${response.insertId}`,
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

	async edit() {

		this.form.removeEventListener('submit', this.form.listener);
		this.form.on('submit', this.form.listener = e => this.update(e));

		this.form.reset();
		this.form.save.classList.remove('unsaved');

		for(const key in this.report) {
			if(this.form.elements[key])
				this.form.elements[key].value = this.report[key];
		}

		this.container.querySelector('#added-by').innerHTML = `
			Added by
			<strong><a href="/user/profile/${this.report.added_by}" target="_blank">${this.report.added_by_name || 'Unknown User'}</a></strong>

			<strong title="${Format.dateTime(this.report.created_at)}">${Format.ago(this.report.created_at)}</strong>
		`;

		if(this.report.is_redis > 0) {
			this.form.redis.value = 'custom';
			this.form.redis_custom.value = this.report.is_redis;
			this.form.redis_custom.classList.remove('hidden');
		}

		else {
			this.form.redis.value = this.report.is_redis || 0;
			this.form.redis_custom.value = null;
			this.form.redis_custom.classList.add('hidden');
		}

		await this.descriptionEditor.setup();

		this.descriptionEditor.value = this.report.description;

		{

			const share = new ObjectRoles('query', this.report.query_id);

			await Promise.all([
				this.descriptionEditor.setup(),
				share.load(),
			]);

			this.shareContainer.textContent = null;
			this.shareContainer.appendChild(share.container);
		}
	}

	async update(e) {

		e.preventDefault();

		this.form.elements.tags.value = this.form.elements.tags.value.split(',').map(t => t.trim()).filter(t => t).join(', ');

		const
			parameters = {
				query_id: this.report.query_id,
				is_redis: this.form.redis.value == 'custom' ? this.form.redis_custom.value : this.form.redis.value,
				description: this.descriptionEditor.value,
			},
			options = {
				method: 'POST',
				form: new FormData(this.form),
			};

		try {

			await API.call('reports/report/update', parameters, options);

			await DataSource.load(true);

			this.load();

			new SnackBar({
				message: 'Report Saved',
				subtitle: `${this.report.name} #${this.report.query_id}`,
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
});

ReportsManger.stages.set('define-report', class DefineReport extends ReportsMangerStage {

	constructor(page, key) {

		super(page, key);

		this.order = '3';
		this.title = 'Define Report\'s Data';
		this.description = 'The report\'s SQL query or API';

		this.schemas = new Map;
		this.schemaLists = new Map;

		const schemaToggle = this.container.querySelector('#schema-toggle');

		schemaToggle.on('click', () => {

			schemaToggle.classList.toggle('selected');

			const container = this.container.querySelector('#schema')

			container.classList.toggle('hidden');

			// Render the schema to the UI if the schema panel isn't hidden
			if(container.classList.contains('hidden'))
				return;

			container.textContent = null;
			container.appendChild(this.schema);
		});

		const filtersToggle = this.container.querySelector('#filters-toggle');

		filtersToggle.on('click', () => {
			filtersToggle.classList.toggle('selected');
			this.filtersManager.container.classList.toggle('hidden');
		});

		const previewToggle = this.container.querySelector('#preview-toggle');

		previewToggle.on('click', () => {

			if(!this.page.preview.report)
				return this.preview();

			previewToggle.classList.toggle('selected');
			this.page.preview.hidden = !previewToggle.classList.contains('selected');

			if(this.report.connection.editor)
				this.report.connection.editor.editor.resize();
		});

		const historyToggle = this.container.querySelector('#history-toggle');

		historyToggle.on('click', async () => {

			historyToggle.classList.toggle('selected');
			this.queryLogs.toggle(historyToggle.classList.contains('selected'));

			if(historyToggle.classList.contains('selected') && !this.queryLogs.size)
				await this.queryLogs.load();
		});

		{

			this.editReportData = new EditReportData();

			this.editReportData.container.classList.add('hidden');
			this.container.querySelector('#define-report-parts').appendChild(this.editReportData.container);

			const editDataToggle = this.container.querySelector('#edit-data-toggle');

			editDataToggle.on('click', async () => {

				editDataToggle.classList.toggle('selected');
				this.editReportData.container.classList.toggle('hidden', !editDataToggle.classList.contains('selected'));
				this.report.connection.form.classList.toggle('hidden');

				if(!this.editReportData.container.classList.contains('hidden'))
					await this.editReportData.load(this.report.query_id);
			});
		}

		this.container.querySelector('#save-container #save-more').on('click', e => {

			e.stopPropagation();

			this.container.querySelector('#save-container #save-more').classList.toggle('selected');
			this.container.querySelector('#save-container #save-menu').classList.toggle('hidden');
		});

		document.body.on('click', () => {
			this.container.querySelector('#save-container #save-more').classList.remove('selected');
			this.container.querySelector('#save-container #save-menu').classList.add('hidden');
		});

		this.container.querySelector('#save-container #fork').on('click', () => this.initializeFork());

		this.container.querySelector('#run').on('click', () => this.preview());
	}

	get url() {
		return `${this.key}/${this.report.query_id}`;
	}

	async preview(logQuery) {

		const definition = logQuery || this.report.connection.json;

		if(this.report.connection.editor && this.report.connection.editor.editor.getSelectedText())
			definition.query = this.report.connection.editor.editor.getSelectedText();

		const options = {
			query_id: this.report.query_id,
			definition: definition,
		};

		await this.page.preview.load(options);

		this.page.preview.hidden = false;
		this.container.querySelector('#preview-toggle').classList.add('selected');

		if(this.report.connection.editor)
			this.report.connection.editor.editor.resize();
	}

	async load() {

		this.report = this.selectedReport;

		if(!this.page.stages.get('configure-visualization').lastSelectedVisualizationId)
			this.page.stages.get('configure-visualization').disabled = true;

		if(!this.report)
			throw new Page.exception('Invalid Report ID');

		if(this.container.querySelector('#define-report-parts > form#define-report-form'))
			this.container.querySelector('#define-report-parts > form#define-report-form').remove();

		this.container.querySelector('#define-report-parts').appendChild(this.report.connection.form);

		this.container.querySelector('#edit-data-toggle').classList.toggle('hidden', !this.report.load_saved);

		if(this.report.connection.editor)
			this.report.connection.editor.editor.focus();

		this.loadSchema();
		ReportsManagerFilters.setup();

		const showFiltersManager = this.filtersManager ? !this.filtersManager.container.classList.contains('hidden') : false;

		if(this.filtersManager)
			this.filtersManager.container.remove();

		this.filtersManager = new ReportsManagerFilters(this);

		if(showFiltersManager)
			this.filtersManager.container.classList.remove('hidden');

		this.container.querySelector('#define-report-parts').appendChild(this.filtersManager.container);

		this.queryLogs = new ReportLogs(this.report, this, {class: QueryLog, name: 'query'});

		const historyToggleSelected = this.container.querySelector('#history-toggle').classList.contains('selected')

		this.queryLogs.toggle(historyToggleSelected);

		if(historyToggleSelected)
			this.queryLogs.load();

		if(this.container.querySelector('#define-report-parts .query-history'))
			this.container.querySelector('#define-report-parts .query-history').remove();

		this.container.querySelector('#define-report-parts').appendChild(this.queryLogs.container);

		this.page.preview.position('bottom');
		this.container.querySelector('#preview-toggle').classList.toggle('selected', !this.page.preview.hidden);

		this.page.stages.get('pick-report').switcher.querySelector('small').textContent = this.report.name + ` #${this.report.query_id}`;
	}

	async update(e) {

		if(e && e.preventDefault)
			e.preventDefault();

		const
			parameters = {
				query_id: this.report.query_id,
				query: this.report.connection.json.query,
				definition: JSON.stringify(this.report.connection.json),
			},
			options = {
				method: 'POST',
			};

		try {

			await API.call('reports/report/update', parameters, options);

			await DataSource.load(true);

			this.queryLogs.clear();
			this.load();

			new SnackBar({
				message: 'Report Saved',
				subtitle: `${this.report.name} #${this.report.query_id}`,
			});

			this.container.querySelector('#stage-define-report > .toolbar button[type=submit]').classList.remove('not-saved');

			if(await Storage.get('newUser'))
				await UserOnboard.setup(true);

		} catch(e) {

			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message,
				type: 'error',
			});

			throw e;
		}
	}

	setDirtyForm() {

		if(!this.report.connection.editor)
			return;

		const query = this.report.connection.json.query;

		this.container.querySelector('#stage-define-report button[type=submit]').classList.toggle('not-saved', this.report.query != query);
	}

	saveReportConfirm() {

		const defineReportSaveButton = this.container.querySelector('#stage-define-report > .toolbar button[type=submit].not-saved');

		if(!defineReportSaveButton)
			return true;

		if(!confirm('Are you sure you want to change the state? All the unsaved data will be lost.'))
			return false;

		defineReportSaveButton.classList.remove('not-saved');

		return true;
	}

	async loadSchema() {

		// Load and save the schema if we haven't already
		if(!this.schemas.has(this.report.connection_name)) {

			try {
				this.schemas.set(this.report.connection_name, await API.call('credentials/schema', { id: this.report.connection_name }));
			} catch(e) {
				return;
			}
		}

		// Prepare a schema list in CodeEditor friendly format
		const
			response = this.schemas.get(this.report.connection_name),
			schema = mysqlKeywords.map(k => {return {
				name: k,
				value: k,
				meta: 'MySQL Keyword',
			}});

		if(this.report) {

			for(const filter of this.report.filters) {
				schema.push({
					name: filter.placeholder,
					value: filter.placeholder,
					meta: 'Report Filter',
				});
			}
		}

		for(const database of response) {

			schema.push({
				name: database.name,
				value: database.name,
				meta: '(d)',
			});

			for(const table of database.tables) {

				schema.push({
					name: table.name,
					value: table.name,
					meta: '(t) ' + database.name,
				});

				for(const column of table.columns) {

					schema.push({
						name: column.name,
						value: column.name,
						meta: '(c) ' + table.name,
					});
				}
			}
		}

		// Attach the schema list to the CodeEditor's autocomplete.
		if(this.report.connection.editor)
			this.report.connection.editor.setAutoComplete(schema);
	}

	/**
	 * Return a div with search input and the schema list for the current report's connection.
	 * We're doing this separately because rendering the UI is a huge cost on the UI thread. And we want to do this on-demand.
	 *
	 * @return HTMLElement	The fragement with the components of the schema UI.
	 */
	get schema() {

		if(this.schemaLists.has(this.report.connection_name))
			return this.schemaLists.get(this.report.connection_name);

		const container = document.createElement('div');

		// If the schema hasn't loaded yet or if it failed to load
		if(!this.schemas.has(this.report.connection_name)) {

			const div = document.createElement('div');

			div.classList.add('NA');
			div.innerHTML = 'Failed to load Schema!';

			container.appendChild(div);

			return container;
		}

		const
			response = this.schemas.get(this.report.connection_name),
			databases = document.createElement('ul'),
			search = document.createElement('input'),
			that = this;

		search.type = 'search';
		search.placeholder = 'Search...';

		search.on('keyup', () => {

			if(window.schemaSearchTimeout)
				clearTimeout(window.schemaSearchTimeout);

			window.schemaSearchTimeout = setTimeout(() => renderList(), 300);
		});

		container.appendChild(search);

		// A separate function because we want to do this on both the search input and on UI load.
		const renderList = () => {

			databases.textContent = null;

			for(const database of response) {

				const tables = document.createElement('ul');

				if(!search.value)
					tables.classList.add('hidden');

				for(const table of database.tables) {

					const columns = document.createElement('ul');

					if(!search.value)
						columns.classList.add('hidden');

					for(const column of table.columns) {

						if(search.value && !column.name.includes(search.value))
							continue;

						let name = column.name;

						if(search.value) {
							name = [
								name.slice(0, name.indexOf(search.value)),
								'<mark>',
								search.value,
								'</mark>',
								name.slice(name.indexOf(search.value) + search.value.length)
							].join('');
						}

						const li = document.createElement('li');

						li.innerHTML = `
							<span class="name">
								<strong>C</strong>
								<span title="${name}">${name}</span>
								<small>${column.type || ''}</small>
							</span>
						`;

						li.querySelector('.name').on('click', () => {

							if(that.report.connection.editor)
								that.report.connection.editor.editor.getSession().insert(that.report.connection.editor.editor.getCursorPosition(), column.name);
						});

						columns.appendChild(li);
					}

					const li = document.createElement('li');

					if(!columns.children.length && !table.name.includes(search.value))
						continue;

					let name = table.name;

					if(search.value && name.includes(search.value)) {
						name = [
							name.slice(0, name.indexOf(search.value)),
							'<mark>',
							search.value,
							'</mark>',
							name.slice(name.indexOf(search.value) + search.value.length)
						].join('');
					}

					li.innerHTML = `
						<span class="name">
							<strong>T</strong>
							<span title="${name}">${name}</span>
							<small>${table.columns.length} columns, <a title="Preview first 100 rows">Pr</a></small>
						</span>
					`;

					li.appendChild(columns)

					li.querySelector('.name').on('click', () => {
						li.classList.toggle('opened');
						columns.classList.toggle('hidden')
					});

					li.querySelector('.name small a').on('click', e => {

						e.stopPropagation();

						if(!this.report)
							return;

						this.container.querySelector('#preview-toggle').classList.add('selected');

						this.page.preview.load({
							definition: {
								query: `SELECT * FROM \`${database.name}\`.\`${table.name}\` LIMIT 100`,
							},
							query_id: this.report.query_id,
						});
					});

					tables.appendChild(li);
				}

				if(!tables.children.length && !database.name.includes(search.value))
					continue;

				const li = document.createElement('li');

				let name = database.name;

				if(search.value && name.includes(search.value)) {
					name = [
						name.slice(0, name.indexOf(search.value)),
						'<mark>',
						search.value,
						'</mark>',
						name.slice(name.indexOf(search.value) + search.value.length)
					].join('');
				}

				li.innerHTML = `
					<span class="name">
						<strong>D</strong>
						<span>${name}</span>
						<small>${database.tables.length} tables</small>
					</span>
				`;

				li.appendChild(tables)

				li.querySelector('span').on('click', () => {
					li.classList.toggle('opened');
					tables.classList.toggle('hidden');
				});

				databases.appendChild(li);
			}

			if(!databases.children.length)
				databases.innerHTML = `<div class="NA">No matches found!</div>`;
		}

		renderList();

		container.appendChild(databases);

		this.schemaLists.set(this.report.connection_name, container);

		return container;
	}

	initializeFork() {

		if(!this.saveReportConfirm())
			return;

		this.load();

		let dialogBox = this.forkDialogBox;

		if(!dialogBox) {

			dialogBox = this.forkDialogBox = new DialogBox();
			dialogBox.body.classList.add('fork-report');

			dialogBox.multiSelect = {
				filters: new MultiSelect({multiple: true, expand: true}),
				visualizations: new MultiSelect({multiple: true, expand: true}),
			};
		}

		dialogBox.heading = `<i class="fas fa-code-branch"></i> &nbsp; Fork ${this.report.name}`;

		dialogBox.body.textContent = null;

		dialogBox.body.innerHTML = `

			<form class="form">

				<label>
					<span>New Report's Name <span class="red">*</span></span>
					<input type="text" name="name" value="${this.report.name}" required>
				</label>

				<label class="filters ${!this.report.filters.length ? 'hidden' : ''}">
					<span>Filters</span>
				</label>

				<label class="visualizations ${!this.report.visualizations.length ? 'hidden' : ''}">
					<span>Visualizations</span>
				</label>

				<label class="switch-to-new">
					<input type="checkbox" name="switchToNew" checked> Switch to the new report
				</label>

				<div class="footer">

					<div class="progress hidden">
						<span class="NA"></span>
						<progress>
					</div>

					<button type="button" class="export">
						<i class="fas fa-file-export"></i>
						Export
					</button>

					<button type="submit" class="selected">
						<i class="fas fa-code-branch"></i>
						Fork Report
						<i class="fas fa-arrow-right"></i>
					</button>
				</div>
			</form>
		`;

		dialogBox.body.querySelector('.filters').appendChild(dialogBox.multiSelect.filters.container);
		dialogBox.body.querySelector('.visualizations').appendChild(dialogBox.multiSelect.visualizations.container);

		dialogBox.multiSelect.filters.datalist = this.report.filters.map(filter => {

			return {
				name: filter.name,
				value: filter.filter_id,
				subtitle: `#${filter.filter_id} &middot; ${filter.type}`,
			}
		});
		dialogBox.multiSelect.filters.render();
		dialogBox.multiSelect.filters.all();

		dialogBox.multiSelect.visualizations.datalist = this.report.visualizations.map(visualization => {

			return {
				name: visualization.name,
				value: visualization.visualization_id,
				subtitle: `#${visualization.visualization_id} &middot; ${MetaData.visualizations.get(visualization.type).name}`,
			}
		});
		dialogBox.multiSelect.visualizations.render();
		dialogBox.multiSelect.visualizations.all();

		dialogBox.body.querySelector('.footer .export').on('click', () => {

			const
				form = this.forkDialogBox.body.querySelector('form'),
				filters = this.forkDialogBox.multiSelect.filters.value,
				visualizations = this.forkDialogBox.multiSelect.visualizations.value,
				json = new DataSource(this.report, this.page).json,
				a = document.createElement('a');

			json.filters = json.filters.filter(f => filters.includes(f.filter_id.toString()))
			json.visualizations = json.visualizations.filter(v => visualizations.includes(v.visualization_id.toString()))

			a.download = `${form.name.value} - ${Format.dateTime(new Date())}.json`;
			a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(json));

			a.click();
		});

		dialogBox.body.querySelector('form').on('submit', async e => {

			if(this.forkInProgress)
				return console.log('forkInProgress');

			this.forkInProgress = true;

			e.preventDefault();

			try {
				await this.fork();
			}
			catch(e) {

				new SnackBar({
					message: 'Failed to fork!',
					subtitle: e.message,
					type: 'error',
				});

				this.forkInProgress = false;
				throw e;
			}

			this.forkInProgress = false;
		});

		dialogBox.show();
	}

	async fork() {

		const
			form = this.forkDialogBox.body.querySelector('form'),
			progress = this.forkDialogBox.body.querySelector('.progress progress'),
			filters = this.forkDialogBox.multiSelect.filters.value,
			visualizations = this.forkDialogBox.multiSelect.visualizations.value,
			json = new DataSource(this.report, this.page).json;

		json.filters = json.filters.filter(f => filters.includes(f.filter_id.toString()))
		json.visualizations = json.visualizations.filter(v => visualizations.includes(v.visualization_id.toString()))

		progress.container = this.forkDialogBox.body.querySelector('.progress'),
		progress.span = this.forkDialogBox.body.querySelector('.progress span');

		function updateProgress({reset = false, max = 0, value = null} = {}) {

			progress.container.classList.remove('hidden');

			if(reset) {

				progress.span.textContent = null;
				progress.max = max;
				progress.value = 0;

				progress.span.innerHTML = value;

				return;
			}

			progress.value++;
			progress.span.innerHTML = value;
		}

		updateProgress({
			reset: true,
			max: filters.length + visualizations.length + 1,
		});

		let newReportId = null;

		{

			updateProgress({value: `Adding new report: <em>${form.name.value}</em>`});

			const options = {
				method: 'POST',
				form: new FormData(),
			};

			for(const key in json)
				options.form.set(key, json[key]);

			options.form.set('name', form.name.value);
			options.form.set('format', json.format);
			options.form.set('definition', json.definition);

			const response = await API.call('reports/report/insert', {}, options);

			newReportId = response.insertId;
		}

		if(!newReportId)
			return updateProgress({reset: true, value: 'Could not insert new report!'});

		for(const filter of json.filters) {

			updateProgress({

				value: `
					Adding new filter:
					<em>${filter.name} (${filter.type})</em>
				`,
			});

			const options = {
				method: 'POST',
				form: new FormData(),
			};

			for(const key in filter)
				options.form.set(key, filter[key]);

			options.form.set('query_id', newReportId);

			await API.call('reports/filters/insert', {}, options);
		}

		for(const visualization of json.visualizations) {

			updateProgress({

				value: `
					Adding new visualization:
					<em>${visualization.name} (${MetaData.visualizations.get(visualization.type).name})</em>
				`,
			});

			const options = {
				method: 'POST',
				form: new FormData(),
			};

			for(const key in visualization) {

				if(typeof visualization[key] != 'object')
					options.form.set(key, visualization[key]);
			}

			options.form.set('options', visualization.options);
			options.form.set('query_id', newReportId);

			await API.call('reports/visualizations/insert', {}, options);
		}

		if(!form.switchToNew.checked) {

			await DataSource.load(true);
			this.forkDialogBox.hide();

			return;
		}

		updateProgress({value: 'Report Forking Complete! Taking you to the new report.'});

		window.location = `/reports/define-report/${newReportId}`;
	}
});

ReportsManger.stages.set('pick-visualization', class PickVisualization extends ReportsMangerStage {

	constructor(page, key) {

		super(page, key);

		this.order = '4';
		this.title = 'Pick Visualization';
		this.description = 'Add or Edit a Visualization';

		this.form = this.page.container.querySelector('#add-visualization-form');

		if(user.privileges.has('visualization.insert')) {

			this.container.querySelector('#add-visualization').classList.remove('grey');

			this.container.querySelector('#add-visualization').on('click', () => {

				this.form.reset();

				this.page.preview.hidden = true;
				this.form.classList.remove('hidden');
				this.container.querySelector('#add-visualization-picker').classList.remove('hidden');
				this.container.querySelector('#visualization-list').classList.add('hidden');
			});
		}

		this.container.querySelector('#visualization-picker-back').on('click', () => {

			this.container.querySelector('#add-visualization-picker').classList.add('hidden');
			this.container.querySelector('#visualization-list').classList.remove('hidden');

			this.page.preview.hidden = false;
		});

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

			label.on('click', label.clickListener = () => {

				if(this.form.querySelector('figure.selected'))
					this.form.querySelector('figure.selected').classList.remove('selected');

				label.querySelector('figure').classList.add('selected');

				this.insert(visualization);
			});

			this.form.appendChild(label);
		}

		if(!MetaData.visualizations.size)
			this.form.innerHTML = `<div class="NA">No visualizations found</div>`;
	}

	get url() {
		return `${this.key}/${this.report.query_id}`;
	}

	async insert(visualization) {

		const
			parameters = {
				query_id: this.report.query_id,
				name: this.report.name,
				type: visualization.slug,
			},
			options = {
				method: 'POST',
			};

		try {

			const response = await API.call('reports/visualizations/insert', parameters, options);

			await DataSource.load(true);

			window.history.pushState({}, '', `/reports/configure-visualization/${response.insertId}`);

			this.page.load();
			this.page.stages.get('configure-visualization').disabled = false;
			this.container.querySelector('#add-visualization-picker').classList.add('hidden');
			this.container.querySelector('#visualization-list').classList.remove('hidden');

			if(await Storage.get('newUser'))
				await UserOnboard.setup();

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

	async delete(visualization) {

		if(!confirm('Are you sure?'))
			return;

		const
			parameters = {
				visualization_id: visualization.visualization_id,
			},
			options = {
				method: 'POST',
			};

		try {

			const response = await API.call('reports/visualizations/delete', parameters, options);

			await DataSource.load(true);

			this.select();

			const type = MetaData.visualizations.get(visualization.type);

			new SnackBar({
				message: `${type ? type.name : ''} Visualization Deleted`,
				subtitle: `${visualization.name} #${visualization.visualization_id}`,
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

	async load() {

		this.report = this.selectedReport;

		this.page.preview.hidden = true;

		if(!this.page.stages.get('configure-visualization').lastSelectedVisualizationId)
			this.page.stages.get('configure-visualization').disabled = true;

		if(!this.report)
			throw new Page.exception('Invalid Report ID');

		const tbody = this.container.querySelector('table tbody');

		tbody.textContent = null;

		for(const visualization of this.report.visualizations) {

			if(!visualization.visualization_id)
				continue;

			const row = document.createElement('tr');

			let type = MetaData.visualizations.get(visualization.type);

			row.innerHTML = `
				<td>
					<a href="/visualization/${visualization.visualization_id}" target="_blank">
						${visualization.name}
					</a>
					<span class="NA">#${visualization.visualization_id}</span>
				</td>
				<td>${type ? type.name : ''}</td>
				<td class="action preview"><i class="fas fa-eye"></i></td>
				<td title="${!visualization.editable ? 'Not enough privileges' : ''}" class="action edit ${visualization.editable ? 'green': 'grey'}"><i class="fas fa-cog"></i></td>
				<td title="${!visualization.deletable ? 'Not enough privileges' : ''}" class="action delete ${visualization.deletable ? 'red': 'grey'}"><i class="far fa-trash-alt"></i></td>
			`;

			if(this.visualization == visualization)
				row.classList.add('selected');

			row.querySelector('.preview').on('click', () => {

				this.page.preview.load({
					query_id: this.report.query_id,
					visualization: {
						id: visualization.visualization_id
					},
				});
			});

			if(visualization.editable) {

				row.querySelector('.edit').on('click', () => {

					window.history.pushState({}, '', `/reports/configure-visualization/${visualization.visualization_id}`);

					this.page.stages.get('configure-visualization').disabled = false;
					this.page.stages.get('configure-visualization').lastSelectedVisualizationId = visualization.visualization_id;

					this.page.load();
				});
			}

			if(visualization.deletable) {
				row.querySelector('.delete').on('click', () => this.delete(visualization));
			}

			tbody.appendChild(row);
		}

		if(!this.report.visualizations.length)
			tbody.innerHTML = '<tr class="NA"><td colspan="6">No Visualization Found!</td></tr>';

		await this.page.preview.position('right');
	}
});

ReportsManger.stages.set('configure-visualization', class ConfigureVisualization extends ReportsMangerStage {

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

			history.pushState({}, '', `/reports/pick-visualization/${this.report.query_id}`);

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

			window.history.pushState({}, '', `/reports/${this.url}`);
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
		this.page.preview.position('right');

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

class ReportsManagerFilters extends Map {

	static async setup() {

		ReportsManagerFilters.externalParameters = new Map;

		const response = await API.call('reports/filters/preReport');

		for(const parameter of response)
			ReportsManagerFilters.externalParameters.set(parameter.placeholder, parameter.value);
	}

	constructor(stage) {

		super();

		this.stage = stage;
		this.page = this.stage.page;

		for(const filter of this.stage.report.filters)
			this.set(filter.placeholder, new ReportsManagerFilter(filter, stage));
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');

		container.id = 'filters';
		container.classList.add('hidden');

		container.innerHTML = `

			<div id="filters-list">

				<div id="list">

					<h3><i class="fas fa-filter"></i> Report Filters</h3>
					<p>These filters will be passed into the report before execution by the end user.</p>

					<div class="toolbar">
						<button class="add-filter-button"><i class="fas fa-plus"></i> Add New Filter</button>
					</div>

					<table>
						<thead>
							<tr>
								<th>ID</th>
								<th>Name</th>
								<th>Placeholder</th>
								<th>Type</th>
								<th>Default Value</th>
								<th>Dataset</th>
								<th class="action">Edit</th>
								<th class="action">Delete</th>
							</tr>
						</thead>
						<tbody></tbody>
					</table>
				</div>

				<div id="suggested-filters" class="hidden">

					<h3><i class="fas fa-thumbs-up"></i> Suggested Filters</h3>
					<p>These filters are suggested based on your query's body.</p>

					<table>
						<thead>
							<tr>
								<th>Name</th>
								<th>Placeholder</th>
								<th>Type</th>
								<th>Default Value</th>
								<th class="action">&nbsp;</th>
							</tr>
						</thead>
						<tbody></tbody>
					</table>
				</div>

				<div id="external-parameters" class="hidden">

					<h3><i class="fas fa-bolt"></i> External Filters</h3>
					<p>These parameters are automatically available as additional information when user logs in through your app.</p>

					<table>
						<thead>
							<tr>
								<th>Placeholer</th>
								<th>Value</th>
								<th class="trusted">
									Trusted
									<span class="NA tooltip" data-tooltip="Trusted values come from the product\nand cannot be changed by the user.">
										<i class="fas fa-question"></i>
									</span>
								</th>
							</tr>
						</thead>
						<tbody></tbody>
					</table>
				</div>
			</div>

			<form class="hidden add-filter">

				<h3><i class="fas fa-plus"></i> Add New Filter</h3>

				<div class="toolbar">

					<button type="button" class="filter-back">
						<i class="fa fa-arrow-left"></i> Back
					</button>

					<button type="submit">
						<i class="far fa-save"></i> Save
					</button>
				</div>

				<div class="form">

					<label>
						<span>Name <span class="red">*</span></span>
						<input type="text" name="name" required>
					</label>

					<label>
						<span>Placeholder <span class="red">*</span><span class="right" data-tooltip="Uniquely identifies the filter in this report.">?</span></span>
						<input type="text" name="placeholder" required>
					</label>

					<label>
						<span>Type <span class="red">*</span></span>
						<select name="type" required></select>
					</label>

					<label>
						<span>Description</span>
						<input type="text" name="description">
					</label>

					<label>
						<span>Order</span>
						<input type="number" name="order">
					</label>

					<label>

						<span>Default Value <span class="right" data-tooltip="Calculated and applied on first load\nif a global filter with same placeholder isn't added.">?</span></span>

						<select name="default_type">
							<option value="none">None</option>
							<option value="default_value">Fixed</option>
							<option value="offset">Relative</option>
						</select>

						<input type="text" name="default_value">

						<input type="number" name="offset">
					</label>

					<label class="dataset">
						<span>Dataset <span class="right" data-tooltip="A set of possible values for this filter.">?</span></span>
					</label>

					<label class="multiple">
						<span>Multiple <span class="right" data-tooltip="Can the user pick multiple values.">?</span></span>
						<select name="multiple">
							<option value="0">No</option>
							<option value="1">Yes</option>
						</select>
					</label>
				</div>
			</form>
		`;

		const tbody = container.querySelector('table tbody');

		for(const filter of this.values())
			tbody.appendChild(filter.row);

		if(!this.size)
			tbody.innerHTML = `<tr class="NA"><td colspan="8">No filters added yet!</td></tr>`;

		container.querySelector('.add-filter-button').on('click', () => this.add());

		{
			this.datasetMultiSelect = new MultiSelect({dropDownPosition: 'top', multiple: false});

			const datalist = [];

			for(const source of DataSource.list.values()) {

				if(source.query_id == this.stage.report.query_id)
					continue;

				datalist.push({
					name: source.name,
					value: source.query_id,
					subtitle: '#' + source.query_id,
				});
			}

			this.datasetMultiSelect.datalist = datalist;
			this.datasetMultiSelect.render();

			container.querySelector('label.dataset').appendChild(this.datasetMultiSelect.container);

			this.datasetMultiSelect.value = this.dataset;
			this.datasetMultiSelect.on('change', () => this.updateFormFields());
		}

		{

			const form = container.querySelector('.add-filter');

			for(const type of MetaData.filterTypes.values()) {

				if(!type.input_type)
					continue;

				form.type.insertAdjacentHTML('beforeend', `
					<option value="${type.name.toLowerCase()}">${type.name}</option>
				`);
			}

			form.type.on('change', () => this.changeFilterType());
			form.default_type.on('change', () => this.updateFormFields());

			this.changeFilterType();
			this.updateFormFields();

			form.on('submit', e => {

				e.preventDefault();

				if(this.stage.saveReportConfirm())
					this.insert();
			});

			container.querySelector('.filter-back').on('click', () => {

				this.stage.filtersManager.container.querySelector('#filters-list').classList.remove('hidden');
				form.classList.add('hidden');
			});
		}

		this.externalParameters();
		this.suggestions();

		return container;
	}

	add(filter = {}) {

		const form = this.container.querySelector('.add-filter');

		form.reset();

		this.stage.filtersManager.container.querySelector('#filters-list').classList.add('hidden');

		form.classList.remove('hidden');

		for(const key in filter) {

			if(key in form.elements)
				form.elements[key].value = filter[key];
		}

		if(form.default_value.value)
			form.default_type.value = 'default_value';

		else if(form.offset.value)
			form.default_type.value = 'offset';

		else
			form.default_type.value = 'none';

		this.datasetMultiSelect.value = filter.dataset || [];

		this.changeFilterType();
		this.updateFormFields();

		form.name.focus();
	}

	async insert() {

		const form = this.container.querySelector('form.add-filter');

		if(form.default_type.value != 'offset')
			form.offset.value = '';

		if(form.default_type.value != 'default_value')
			form.default_value.value = '';

		const
			parameters = {
				query_id: this.stage.report.query_id,
				dataset: this.datasetMultiSelect.value[0] || '',
			},
			options = {
				method: 'POST',
				form: new FormData(form),
			};

		if(this.has(form.placeholder.value)) {

			return new SnackBar({
				message: 'Placeholer already exists!',
				subtitle: `Placeholer ${form.placeholder.value} is already in use by ${this.get(form.placeholder.value).name} filter`,
				type: 'error',
			});
		}

		try {

			await API.call('reports/filters/insert', parameters, options);

			await DataSource.load(true);

			await this.stage.load();

			this.stage.filtersManager.container.classList.remove('hidden');

			new SnackBar({
				message: `${form.name.value} Filter Added`,
				subtitle: `Type: <strong>${MetaData.filterTypes.get(form.type.value).name}</strong> Placeholer: <strong>${form.placeholder.value}</strong></span>`,
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

	async externalParameters() {

		const
			externalParameters = this.page.account.settings.get('external_parameters'),
			externalParametersValues = (await Storage.get('external_parameters')) || {},
			container = this.container.querySelector('#external-parameters');

		if(!externalParameters || !externalParameters.length)
			return;

		container.classList.remove('hidden');

		const tbody = container.querySelector('tbody');

		for(const parameter of externalParameters) {

			let value = '';

			if(parameter in externalParametersValues)
				value = externalParametersValues[parameter];

			if(ReportsManagerFilters.externalParameters.has(parameter))
				value = ReportsManagerFilters.externalParameters.get(parameter);

			tbody.insertAdjacentHTML('beforeend', `
				<tr>
					<td>${parameter}</td>
					<td>${value}</td>
					<td>${ReportsManagerFilters.externalParameters.has(parameter) ? 'Yes' : 'No'}</td>
				</tr>
			`);
		}
	}

	suggestions() {

		// If the connection type doesn't have an editor (API, CSV, etc)
		if(!this.stage.report.connection.editor)
			return;

		let placeholders = this.stage.report.connection.editor.value.match(/{{([a-zA-Z0-9_-]*)}}/g) || [];

		placeholders = new Set(placeholders.map(a => a.match('{{(.*)}}')[1]));

		const
			suggested = new Set(placeholders),
			container = this.container.querySelector('#suggested-filters');

		for(const filter of this.values()) {

			suggested.delete(filter.placeholder);

			if(!filter.row)
				continue;

			filter.row.classList.remove('red');

			if(!placeholders.has(filter.placeholder))
				filter.row.classList.add('red');
		}

		container.classList.toggle('hidden', !suggested.size);

		if(!suggested.size)
			return;

		const tbody = container.querySelector('tbody');

		tbody.textContent = null;

		for(const placeholder of suggested) {

			let
				split = placeholder ? placeholder.split('_') : [],
				name = split.filter(w => w).map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
				type = 'text',
				globalFilter = {};

			if(placeholder.includes('date'))
				type = 'date';

			else if(split.includes('id'))
				type = 'number';

			for(const filter of MetaData.globalFilters.values()) {

				if(filter.placeholder == placeholder)
					globalFilter = filter;
			}

			const row = document.createElement('tr');

			row.innerHTML = `
				<td>${name}</td>
				<td>${placeholder}</td>
				<td>${type}</td>
				<td>${globalFilter.default_value || globalFilter.offset || ''}</td>
				<td class="action green">Add Now &nbsp; <i class="fas fa-arrow-right"></i></td>
			`;

			row.on('mouseenter', () => {

				clearTimeout(row.placeholderTimeout);

				row.placeholderTimeout = setTimeout(() => {
					this.stage.report.connection.editor.editor.findAll(`{{${placeholder}}}`);
				}, 500);
			});

			row.on('mouseleave', () => clearTimeout(row.placeholderTimeout));

			row.querySelector('.green').on('click', () => {

				this.add({
					name,
					type: globalFilter.type || type,
					placeholder,
					dataset: globalFilter.dataset || null,
					multiple: isNaN(globalFilter.multiple) ? null : globalFilter.multiple,
					description: globalFilter.description || null,
					default_value: globalFilter.default_value || null,
					offset: globalFilter.offset || null,
					order: globalFilter.order || null,
				});
			});

			tbody.appendChild(row);
		}
	}

	changeFilterType() {

		const
			form = this.container.querySelector('form'),
			types = ['hidden', 'column', 'literal'];

		if(form.type.value == 'datetime')
			form.default_value.type = 'datetime-local';

		else if(form.type.value == 'year')
			form.default_value.type = 'number';

		else if(form.type.value == 'time') {

			form.default_value.type = 'time';
			form.default_value.step = '1';
		}

		else if(types.includes(form.type.value))
			form.default_value.type = 'text';

		else
			form.default_value.type = form.type.value;
	}

	updateFormFields() {

		const form = this.container.querySelector('form');

		form.default_value.classList.toggle('hidden', form.default_type.value != 'default_value');
		form.offset.classList.toggle('hidden', form.default_type.value != 'offset');

		form.querySelector('.multiple').classList.toggle('hidden', !this.datasetMultiSelect.value.length);
	}
}

class ReportsManagerFilter {

	constructor(filter, stage) {

		Object.assign(this, filter);
		this.id = this.filter_id;

		this.stage = stage;
		this.page = this.stage.page;
	}

	get row() {

		if(this.rowElement)
			return this.rowElement;

		const row = this.rowElement = document.createElement('tr');

		let datasetName = '';

		if(this.dataset && DataSource.list.has(this.dataset)) {

			const dataset = DataSource.list.get(this.dataset);

			datasetName = `
				<a href="/report/${dataset.query_id}" target="_blank" title="${DataSource.list.get(dataset.query_id).name}">
					${dataset.name}
				</a>
			`;
		}

		row.innerHTML = `
			<td>${this.id}</td>
			<td>${this.name}</td>
			<td>${this.placeholder}</td>
			<td>${this.type}</td>
			<td>${this.default_value || (isNaN(parseFloat(this.offset)) ? '' : this.offset)}</td>
			<td>${datasetName}</td>
			<td class="action green"><i class="far fa-edit"></i></td>
			<td class="action red"><i class="far fa-trash-alt"></i></td>
		`;

		row.querySelector('.green').on('click', () => this.edit());
		row.querySelector('.red').on('click', () => this.delete());

		row.on('mouseenter', () => {

			clearTimeout(this.placeholderTimeout);

			this.placeholderTimeout = setTimeout(() => {
				this.stage.report.connection.editor.editor.findAll(`{{${this.placeholder}}}`);
			}, 500);
		});

		row.on('mouseleave', () => clearTimeout(this.placeholderTimeout));

		return row;
	}

	edit() {

		this.stage.filtersManager.container.appendChild(this.form);
		this.stage.filtersManager.container.querySelector('#filters-list').classList.add('hidden');
		this.form.classList.remove('hidden');

		this.form.name.focus();
	}

	get form() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('form');

		container.classList.add('edit-filter');

		container.innerHTML = `

			<h3><i class="far fa-edit"></i> Edit Filter ${this.name}</h3>

			<div class="toolbar">

				<button type="button" class="filter-back">
					<i class="fa fa-arrow-left"></i> Back
				</button>

				<button type="submit">
					<i class="far fa-save"></i> Save
				</button>

				<span class="NA filter-info">
					Created: <strong title="${this.created_at}">${Format.ago(this.created_at)}</strong><br>
					Updated: <strong title="${this.updated_at}">${Format.ago(this.updated_at)}</strong>
				</span>
			</div>

			<div class="form">

				<label>
					<span>Name <span class="red">*</span></span>
					<input type="text" name="name" value="${this.name || ''}" required>
				</label>

				<label>
					<span>Placeholder <span class="red">*</span><span class="right" data-tooltip="Uniquely identifies the filter in this report.">?</span></span>
					<input type="text" name="placeholder" value="${this.placeholder || ''}" required>
				</label>

				<label>
					<span>Type <span class="red">*</span></span>
					<select name="type" required></select>
				</label>

				<label>
					<span>Description</span>
					<input type="text" name="description" value="${this.description || ''}">
				</label>

				<label>
					<span>Order</span>
					<input type="number" name="order" value="${this.order || ''}">
				</label>

				<label>

					<span>Default Value <span class="right" data-tooltip="Calculated and applied on first load\nif a global filter with same placeholder isn't added.">?</span></span>

					<select name="default_type">
						<option value="none">None</option>
						<option value="default_value">Fixed</option>
						<option value="offset">Relative</option>
					</select>

					<input type="text" name="default_value" value="${this.default_value || ''}">

					<input type="number" name="offset" value="${isNaN(parseFloat(this.offset)) ? '' : this.offset}">
				</label>

				<label class="dataset">
					<span>Dataset <span class="right" data-tooltip="A set of possible values for this filter.">?</span></span>
				</label>

				<label class="multiple">
					<span>Allow Multiple <span class="right" data-tooltip="Can the user pick multiple values.">?</span></span>
					<select name="multiple" required>
						<option value="0">No</option>
						<option value="1">Yes</option>
					</select>
				</label>
			<form>
		`;

		container.querySelector('.filter-back').on('click', () => {

			this.stage.filtersManager.container.querySelector('#filters-list').classList.remove('hidden');
			container.classList.add('hidden');
		});

		{
			container.multiple.value = this.multiple || '0';

			this.datasetMultiSelect = new MultiSelect({dropDownPosition: 'top', multiple: false});

			const datalist = [];

			for(const source of DataSource.list.values()) {

				if(source.query_id == this.stage.report.query_id)
					continue;

				datalist.push({
					name: source.name,
					value: source.query_id,
					subtitle: '#' + source.query_id,
				});
			}

			this.datasetMultiSelect.datalist = datalist;
			this.datasetMultiSelect.render();

			container.querySelector('label.dataset').appendChild(this.datasetMultiSelect.container);

			this.datasetMultiSelect.value = this.dataset;
			this.datasetMultiSelect.on('change', () => {
				this.updateFormFields();
				this.setDirtyForm();
			});
		}

		{

			const
				default_value = container.default_value.value,
				default_value_offset = container.offset.value;

			for(const type of MetaData.filterTypes.values()) {

				if(!type.input_type)
					continue;

				container.type.insertAdjacentHTML('beforeend', `
					<option value="${type.name.toLowerCase()}">${type.name}</option>
				`);
			}

			container.type.value = this.type || 'text';

			if(container.default_value.value)
				container.default_type.value = 'default_value';

			else if(container.offset.value)
				container.default_type.value = 'offset';

			else
				container.default_type.value = 'none';

			container.type.on('change', () => {

				this.changeFilterType();

				container.default_value.value = default_value;
				container.offset.value = default_value_offset;
			});

			container.default_type.on('change', () => this.updateFormFields());

			this.changeFilterType();
			this.updateFormFields();
		}

		container.on('submit', e => {

			e.preventDefault();

			if(this.stage.saveReportConfirm())
				this.update();
		});

		{

			for(const element of container.elements) {

				element.on('keyup', () => this.setDirtyForm());
				element.on('change', () => this.setDirtyForm());
			}
		}

		return container;
	}

	async update() {

		if(this.form.default_type.value != 'offset')
			this.form.offset.value = '';

		if(this.form.default_type.value != 'default_value')
			this.form.default_value.value = '';

		const options = {
			method: 'POST',
		};

		try {

			await API.call('reports/filters/update', this.json, options);

			await DataSource.load(true);

			await this.stage.load();

			this.stage.filtersManager.container.classList.remove('hidden');

			new SnackBar({
				message: `${this.form.name.value} Filter Saved`,
				subtitle: `Type: <strong>${MetaData.filterTypes.get(this.form.type.value).name}</strong> Placeholer: <strong>${this.form.placeholder.value}</strong>`,
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
				filter_id: this.id,
			},
			options = {
				method: 'POST',
			};

		try {

			await API.call('reports/filters/delete', parameters, options);

			await DataSource.load(true);

			await this.stage.load();

			this.stage.filtersManager.container.classList.remove('hidden');

			new SnackBar({
				message: `${this.name} Filter Deleted`,
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

	get json() {

		const response = {
			filter_id: this.id,
			dataset: this.datasetMultiSelect.value[0] || '',
		};

		for(const [name, value] of new FormData(this.form))
			response[name] = value;

		response.multiple = parseInt(response.multiple) || 0;

		return response;
	}

	changeFilterType() {

		const types = ['hidden', 'column', 'literal'];

		if(this.form.type.value == 'datetime')
			this.form.default_value.type = 'datetime-local';

		else if(this.form.type.value == 'year')
			this.form.default_value.type = 'number';

		else if(this.form.type.value == 'time') {

			this.form.default_value.type = 'time';
			this.form.default_value.step = '1';
		}

		else if(types.includes(this.form.type.value))
			this.form.default_value.type = 'text';

		else
			this.form.default_value.type = this.form.type.value;
	}

	updateFormFields() {

		this.form.default_value.classList.toggle('hidden', this.form.default_type.value != 'default_value');
		this.form.offset.classList.toggle('hidden', this.form.default_type.value != 'offset');

		this.form.querySelector('.multiple').classList.toggle('hidden', !this.datasetMultiSelect.value.length);
	}

	setDirtyForm() {

		const
			submit = this.form.querySelector('button[type=submit]'),
			json = this.json;

		let dirty = false;

		for(const key in json) {

			if(key in this && (this[key] || json[key]) && this[key] != json[key])
				dirty = key;
		}

		submit.classList.toggle('not-saved', dirty);
		submit.title = dirty ? ('Changed Field: ' + dirty) : '';
	}
}

class VisualizationManager {

	constructor(visualization, stage) {

		Object.assign(this, visualization);
		this.stage = stage;

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

class QueryLog extends ReportLog {

	load() {

		const logInfo = this.logs.container.querySelector('.info');

		logInfo.classList.remove('hidden');
		this.logs.container.querySelector('.list').classList.add('hidden');

		logInfo.querySelector('.toolbar').innerHTML =  `
			<button class="back"><i class="fa fa-arrow-left"></i> Back</button>
			<button class="restore"><i class="fa fa-window-restore"></i> Restore</button>
			<button class="run"><i class="fas fa-sync"></i> Run</button>
			<span class="log-title">
				<a href="/user/profile/${this.user_id}" target="_blank">${this.user_name}</a> &#183; ${Format.dateTime(this.created_at)}
			</span>
		`;

		logInfo.querySelector('.toolbar button.back').on('click', () => {

			this.logs.container.querySelector('.list').classList.remove('hidden');
			logInfo.classList.add('hidden');
		});

		logInfo.querySelector('.toolbar .restore').on('click', () => {

			this.logs.owner.connection.formJson = this.connection.json;

			new SnackBar({
				message: this.owner_id + ' Query Restored',
				subtitle: 'The restored query is not saved yet and will be lost on page reload.',
				icon: 'fa fa-plus',
			});
		});

		logInfo.querySelector('.toolbar .run').on('click', () => {

			this.logs.page.preview(this.connection.json);
		});

		const
			queryInfo = this.logs.container.querySelector('.info div.block'),
			connection = this.logs.page.page.connections.get(parseInt(this.logs.owner.connection_name));

		queryInfo.textContent = null;
		queryInfo.classList.add('query');

		try {

			this.state.definition = JSON.parse(this.state.definition);
		}
		catch(e) {}

		if(['file'].includes(connection.type)) {

			queryInfo.innerHTML = '<div class="NA">No Report History Available</div>';
			return;
		}

		this.connection = new (ReportConnection.types.get(connection.type))(this.state, this.logs.page, true);

		queryInfo.appendChild(this.connection.form);

		this.logs.owner.connection.editor.editor.session.on('changeScrollTop', this.editorScrollListener = () => {

			clearTimeout(QueryLog.scrollTimeout);

			QueryLog.scrollTimeout = setTimeout(() => {

				this.connection.editor.editor.resize(true);
				this.connection.editor.editor.scrollToLine(this.logs.owner.connection.editor.editor.getFirstVisibleRow());

				this.connection.editor.editor.gotoLine(this.logs.owner.connection.editor.editor.getLastVisibleRow());
			}, 100);

		});
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

			this.logsVisualizationManager = new VisualizationManager(this.state, this.logs.page);
		}

		queryInfo.appendChild(this.logsVisualizationManager.container);

		this.logsVisualizationManager.load();
	}
}

class ReportConnection {

	constructor(report, stage, logsEditor = false) {

		this.report = report;
		this.stage = stage;
		this.logsEditor = logsEditor;
	}

	get form() {

		if(this.formElement)
			return this.formElement;

		const form = this.formElement = document.createElement('form');

		form.id = 'define-report-form';

		form.on('submit', e => this.stage.update(e));

		return form;
	}

	set formJson(json = {}) {

		for(const key in json) {

			if(!(key in this.form.elements)) {

				continue;
			}

			this.form.elements[key].value = json[key];
		}

		if(this.editor) {

			this.editor.value = json.query;
		}
	}

	get json() {
		return {};
	}

	setEditorKeyboardShortcuts() {

		if(!this.editor)
			return;

		// The keyboard shortcut to submit the form on Ctrl + S inside the editor.
		this.editor.editor.commands.addCommand({
			name: 'save',
			bindKey: { win: 'Ctrl-S', mac: 'Cmd-S' },
			exec: async () => {

				const cursor = this.editor.editor.getCursorPosition();

				await this.stage.update();

				this.editor.editor.gotoLine(cursor.row + 1, cursor.column);
			},
		});

		this.stage.page.keyboardShortcuts.set('Ctrl + S', {
			title: 'Save Report',
			description: 'Save the current report query. Only works when focus is set on query editor.',
		});

		// The keyboard shortcut to test the query on Ctrl + E inside the editor.
		this.editor.editor.commands.addCommand({
			name: 'execute',
			bindKey: { win: 'Ctrl-E', mac: 'Cmd-E' },
			exec: () => this.stage.preview(),
		});

		this.stage.page.keyboardShortcuts.set('Ctrl + E', {
			title: 'Execute Report',
			description: 'Execute the current report query without saving it. Only works when focus is set on query editor.',
		});

		if(this.editor.mode == 'sql') {

			// The keyboard shortcut to format the query on Ctrl + Y inside the editor.
			this.editor.editor.commands.addCommand({
				name: 'format',
				bindKey: { win: 'Ctrl-Y', mac: 'Cmd-Y' },
				exec: () => this.editor.value = new FormatSQL(this.editor.value).query,
			});

			this.stage.page.keyboardShortcuts.set('Ctrl + Y', {
				title: 'Format Query',
				description: 'Use the (experimental) query formatter. Only works when focus is set on query editor.',
			});
		}
	}
}

ReportConnection.types = new Map();

ReportConnection.types.set('mysql', class ReportConnectionMysql extends ReportConnection {

	constructor(report, stage, logsEditor) {

		super(report, stage, logsEditor);

		this.editor = new CodeEditor({mode: 'sql'});

		this.editor.on('change', () => {

			this.stage.setDirtyForm();

			if(this.stage.filtersManager)
				this.stage.filtersManager.suggestions();
		});

		setTimeout(() => this.setEditorKeyboardShortcuts());
	}

	get form() {

		if(this.formElement)
			return this.formElement;

		super.form.appendChild(this.editor.container);

		this.formJson = this.report.definition || {};

		return super.form;
	}

	get json() {

		return {
			query: this.editor.value,
		};
	}
});

ReportConnection.types.set('mssql', class ReportConnectionMysql extends ReportConnection {

	constructor(report, stage, logsEditor) {

		super(report, stage, logsEditor);

		this.editor = new CodeEditor({mode: 'sql'});

		if(this.logsEditor)
			this.editor.editor.setTheme('ace/theme/clouds');

		this.editor.on('change', () => {

			this.stage.setDirtyForm();

			if(this.stage.filtersManager)
				this.stage.filtersManager.suggestions();
		});

		setTimeout(() => this.setEditorKeyboardShortcuts());
	}

	get form() {

		if(this.formElement)
			return this.formElement;

		super.form.appendChild(this.editor.container);

		this.formJson = this.report.definition || {};

		return super.form;
	}

	get json() {

		return {
			query: this.editor.value,
		};
	}
});

ReportConnection.types.set('pgsql', class ReportConnectionMysql extends ReportConnection {

	constructor(report, stage, logsEditor) {

		super(report, stage, logsEditor);

		this.editor = new CodeEditor({mode: 'sql'});

		if(this.logsEditor)
			this.editor.editor.setTheme('ace/theme/clouds');

		this.editor.on('change', () => {

			this.stage.setDirtyForm();

			if(this.stage.filtersManager)
				this.stage.filtersManager.suggestions();
		});

		setTimeout(() => this.setEditorKeyboardShortcuts());
	}

	get form() {

		if(this.formElement)
			return this.formElement;

		super.form.appendChild(this.editor.container);

		this.formJson = this.report.definition || {};

		return super.form;
	}

	get json() {

		return {
			query: this.editor.value,
		};
	}
});

ReportConnection.types.set('bigquery', class ReportConnectionMysql extends ReportConnection {

	constructor(report, stage, logsEditor) {

		super(report, stage, logsEditor);

		this.editor = new CodeEditor({mode: 'sql'});

		if(this.logsEditor)
			this.editor.editor.setTheme('ace/theme/clouds');

		this.editor.on('change', () => {

			this.stage.setDirtyForm();

			if(this.stage.filtersManager)
				this.stage.filtersManager.suggestions();
		});

		setTimeout(() => this.setEditorKeyboardShortcuts());
	}

	get form() {

		if(this.formElement)
			return this.formElement;

		super.form.appendChild(this.editor.container);

		this.formJson = this.report.definition || {};

		return super.form;
	}

	get json() {

		return {
			query: this.editor.value,
		};
	}
});

ReportConnection.types.set('bigquery_legacy', class ReportConnectionMysql extends ReportConnection {

	constructor(report, stage, logsEditor) {

		super(report, stage, logsEditor);

		this.editor = new CodeEditor({mode: 'sql'});

		if(this.logsEditor)
			this.editor.editor.setTheme('ace/theme/clouds');

		this.editor.on('change', () => {

			this.stage.setDirtyForm();

			if(this.stage.filtersManager)
				this.stage.filtersManager.suggestions();
		});

		setTimeout(() => this.setEditorKeyboardShortcuts());
	}

	get form() {

		if(this.formElement)
			return this.formElement;

		super.form.appendChild(this.editor.container);

		this.formJson = this.report.definition || {};

		return super.form;
	}

	get json() {

		return {
			query: this.editor.value,
		};
	}
});

ReportConnection.types.set('api', class ReportConnectionAPI extends ReportConnection {

	get form() {

		if(this.formElement)
			return this.formElement;

		super.form.classList.add('form');

		super.form.innerHTML = `

			<label>
				<span>URL</span>
				<input type="url" name="url">
			</label>

			<label>
				<span>Method</span>
				<select name="method">
					<option>GET</option>
					<option>POST</option>
				</select>
			</label>
		`;

		// Set the vlues from report definition
		this.formJson = this.report.definition || {};

		return super.form;
	}

	get json() {

		return {
			url: this.form.url.value,
			method: this.form.method.value,
		};
	}
});

/**
 * Upload a CSV, TSV or JSON data file from the user into a report.
 */
ReportConnection.types.set('file', class ReportConnectionAPI extends ReportConnection {

	/**
	 * The upload-file container element.
	 * This also acts as a drop surface and a way to give user feedback on the upload status.
	 *
	 * @return HTMLElement
	 */
	get form() {

		if(this.formElement)
			return this.formElement;

		const form = super.form;

		form.classList.add('upload-file');

		form.innerHTML = `
			<input type="file" accept=".xlsx, .xls, .csv, .tsv, .json" class="hidden">
			<h2>Drop File Here</h2>
			<small>Or click to upload&hellip;</small>
			<div class="message hidden"></div>
		`;

		const input = form.querySelector('input');

		input.on('change', e => {
			if(e.target.files.length)
				this.upload(e.target.files[0]);
		});

		form.on('click', () => input.click());

		form.on('dragenter', e => e.preventDefault());

		form.on('dragover', e => {

			e.preventDefault();

			if(!e.dataTransfer.types || !e.dataTransfer.types.includes('Files'))
				return this.message('Please upload a valid file.', 'warning');

			if(e.dataTransfer.items.length > 1)
				return this.message('Please upload only one file.', 'warning');

			form.classList.add('drag-over');

			this.message('Drop to upload one file.', 'notice');
		});

		form.on('dragleave', () => {

			this.message();
			form.classList.remove('drag-over');
		});

		form.on('drop', e => {

			e.preventDefault();

			if(!e.dataTransfer.types || !e.dataTransfer.types.includes('Files'))
				return this.message('Please upload a valid file', 'warning');

			if(e.dataTransfer.items.length > 1)
				return this.message('Please upload only one file', 'warning');

			form.classList.remove('drag-over');

			const [file] = e.dataTransfer.files;

			this.upload(file);
		});

		return form;
	}

	/**
	 * Attach an event listener on the upload instance.
	 *
	 * @param string	event		The event type (eg. upload)
	 * @param Function	callback	The callback function to call when the event happens.
	 */
	on(event, callback) {

		if(event == 'upload')
			this.onUpload = callback;

		else throw new Page.exception(`Invalid event File Upload event type ${event}!`);
	}

	/**
	 * Upload a file's data to the report.
	 *
	 * @param File	The File object for the file that is being uploaded.
	 */
	upload(file) {

		if(!this.stage.report.load_saved)
			return this.message('This report doesn\'t have \'Store Result\' property enabled!', 'warning');

		this.message(`Uploading ${file.name}`, 'notice');

		const fileReader = new FileReader();

		let separator = ',';

		if(file.name.endsWith('.tsv'))
			separator = '\t';

		fileReader.onload = async e => {

			if(!e.target.result.trim())
				return this.message('Uploaded file is empty', 'warning');

			const
				parameter = {
					data: this.toJSON(e.target.result.trim(), separator),
					query_id: this.stage.report.query_id,
				},
				options = {
					method: 'POST',
				};

			try {
				await API.call('reports/engine/report', parameter, options);
			} catch(e) {
				this.message(e.message, 'warning');
			}

			if(this.onUpload)
				this.onUpload();

			this.message('Upload Complete', 'notice');

			this.stage.preview();
		};

		fileReader.readAsText(file);
	}

	/**
	 * Convert a file input to JSON.
	 * This will handle types of input like JSON, CSV or TSV.
	 *
	 * @param  string	input		The input string that needs to be converted.
	 * @param  string	separator	The column separator to use.
	 * @return string				The stringified JSON that was extracted from the input.
	 */
	toJSON(input, separator = ',') {

		try {
			return JSON.stringify(JSON.parse(input));
		} catch(e) {}

		const
			lines = input.split('\n'),
			result = [],
			headers = split(lines[0]);

		for(const line of lines.slice(1)) {

			const row = {};

			for(const [index, cell] of split(line).entries())
				row[headers[index]] = cell;

			result.push(row);
		}

		function split(string) {

			for (var splitString = string.split(separator), len = splitString.length - 1, tl; len >= 0; len--) {

				if (splitString[len].replace(/"\s+$/, '"').charAt(splitString[len].length - 1) === '"') {

					if ((tl = splitString[len].replace(/^\s+"/, '"')).length > 1 && tl.charAt(0) === '"') {

						splitString[len] = splitString[len].replace(/^\s*"|"\s*$/g, '').replace(/""/g, '"');
					}

					else if (len) {
						splitString.splice(len - 1, 2, [splitString[len - 1], splitString[len]].join(separator));
					}

					else splitString = splitString.shift().split(separator).concat(splitString);
				}

				else splitString[len].replace(/""/g, '"');
			}

			for(let [index, element] of splitString.entries()) {

				if(element.split(',').length === 1 && element.startsWith('"')) {

					splitString[index] = element.replace(/"/g, '');
				}
			}

			return splitString.map(v => v.trim());
		}

		return JSON.stringify(result);
	}

	/**
	 * Show a message to the user on the file upload window with give color.
	 *
	 * @param  string	body	The message body.
	 * @param  string	type	The type of the message (notice, warning or nothing)
	 */
	message(body = '', type = null) {

		const form = this.form.querySelector('.message');

		form.classList.remove('notice', 'warning');
		form.classList.toggle('hidden', !body);
		this.form.querySelector('h2').classList.toggle('hidden', body);
		this.form.querySelector('small').classList.toggle('hidden', body);

		if(type)
			form.classList.add(type);

		form.innerHTML = body;
	}
});

ReportConnection.types.set('mongo', class ReportConnectionMysql extends ReportConnection {

	constructor(report, stage, logsEditor) {

		super(report, stage, logsEditor);

		this.editor = new CodeEditor({mode: 'javascript'});

		if(this.logsEditor)
			this.editor.editor.setTheme('ace/theme/clouds');

		this.editor.on('change', () => {

			this.stage.setDirtyForm();

			if(this.stage.filtersManager)
				this.stage.filtersManager.suggestions();
		});

		setTimeout(() => this.setEditorKeyboardShortcuts());
	}

	get form() {

		if(this.formElement)
			return this.formElement;

		super.form.classList.add('form');

		super.form.innerHTML = `

			<label>
				<span>Collection Name</span>
				<input type="text" name="collection_name">
			</label>

			<label class="mongo-query">
				<span>Query</span>
			</label>
		`;

		super.form.querySelector('label.mongo-query').appendChild(this.editor.container);

		// Set the values from report definition
		this.formJson = this.report.definition || {};

		return super.form;
	}

	get json() {

		return {
			collection_name: this.form.collection_name.value,
			query: this.editor.value,
		};
	}
});

ReportConnection.types.set('oracle', class ReportConnectionMysql extends ReportConnection {

	constructor(report, stage, logsEditor) {

		super(report, stage, logsEditor);

		this.editor = new CodeEditor({mode: 'sql'});

		if(this.logsEditor) {

			this.editor.editor.setTheme('ace/theme/clouds');
		}

		this.editor.on('change', () => {

			this.stage.setDirtyForm();

			if(this.stage.filtersManager)
				this.stage.filtersManager.suggestions();
		});

		setTimeout(() => this.setEditorKeyboardShortcuts());
	}

	get form() {

		if(this.formElement)
			return this.formElement;

		super.form.appendChild(this.editor.container);

		this.formJson = this.report.definition || {};

		return super.form;
	}

	get json() {

		return {
			query: this.editor.value,
		};
	}
});

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
								<option value="top">Top</option>
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
							<option value="top">Top</option>
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
						<span>Line Thickness (Line Only)</span>
						<input type="number" step="0.1" name="axisLineThickness" value="${this.lineThickness || ''}">
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

			for(const elemen of container.querySelectorAll('.advanced'))
				elemen.classList.toggle('hidden');
		});

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

		container.querySelector('select[name=axis-type]').value = this.type;
		container.querySelector('select[name=position]').value = this.position;
		container.querySelector('select[name=format]').value = this.format || '';
		container.querySelector('select[name=curve]').value = this.curve || 'linear';
		container.querySelector('input[name=axisDepth]').value = this.depth;
		container.querySelector('input[name=axisLineThickness]').value = this.lineThickness;
		container.querySelector('input[name=axisStacked]').checked = this.stacked;
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
			stacked: this.container.querySelector('input[name=axisStacked]').checked,
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

const ConfigureVisualization = ReportsManger.stages.get('configure-visualization');

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

		for(const row of this.rows || [])
			rows.appendChild(this.row(row));

		const addRow = document.createElement('button');

		addRow.type = 'button';
		addRow.innerHTML = `<i class="fa fa-plus"></i> Add New Row`;

		addRow.on('click', () => {
			rows.insertBefore(this.row(), addRow);
			this.render();
		});

		rows.appendChild(addRow);

		for(const column of this.columns || [])
			columns.appendChild(this.column(column));

		const addColumn = document.createElement('button');

		addColumn.type = 'button';
		addColumn.innerHTML = `<i class="fa fa-plus"></i> Add New Column`;

		addColumn.on('click', () => {
			columns.insertBefore(this.column(), addColumn);
			this.render();
		});

		columns.appendChild(addColumn);

		for(const value of this.values || [])
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

		const response = {
			type: this.key,
			rows: [],
			columns: [],
			values: [],
		};

		for(const row of this.container.querySelectorAll('.row')) {
			response.rows.push({
				column: row.querySelector('*[name=column]').value,
			});
		}

		for(const column of this.container.querySelectorAll('.column')) {
			response.columns.push({
				column: column.querySelector('*[name=column]').value,
			});
		}

		for(const value of this.container.querySelectorAll('.value')) {
			response.values.push({
				column: value.querySelector('*[name=column]').value,
				function: value.querySelector('select[name=function]').value,
				name: value.querySelector('input[name=name]').value
			});
		}

		if(!response.rows.length && !response.columns.length && !response.values.length)
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

		for(const filter of this.filters || [])
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

		const response = {
			type: this.key,
			filters: [],
		};

		for(const filter of this.container.querySelectorAll('.filter')) {

			response.filters.push({
				column: filter.querySelector('select[name=column]').value,
				function: filter.querySelector('select[name=function]').value,
				value: filter.querySelector('input[name=value]').value,
			});
		}

		if(!response.filters.length)
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
				<input type="text" name="content" value="${this.content || ''}">
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

		if(this.column)
			column.dataset.value = this.column;

		if(this.granularity)
			granularity.value = this.granularity;

		if(this.start_filter)
			startFilter.value = this.start_filter;

		if(this.end_filter)
			endFilter.value = this.end_filter;

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

		return {
			type: this.key,
			column: this.container.querySelector('[name=column]').value,
			granularity: this.container.querySelector('[name=granularity]').value,
			content: this.container.querySelector('[name=content]').value,
			start_filter: this.container.querySelector('[name=start_filter]').value,
			end_filter: this.container.querySelector('[name=end_filter]').value,
		};
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

		for(const join of this.joins || [])
			joins.appendChild(this.join(join));

		const addJoin = document.createElement('button');

		addJoin.type = 'button';
		addJoin.innerHTML = `<i class="fa fa-plus"></i> Add New Join`;

		addJoin.on('click', () => {
			joins.insertBefore(this.join(), addJoin);
			this.render();
		});

		joins.appendChild(addJoin);

		for(const column of this.columns || [])
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

		this.visualizations.value = this.visualization_id;

		container.querySelector('.visualization').appendChild(this.visualizations.container);
		container.appendChild(joins);
		container.appendChild(columns);

		return super.container;
	}

	get json() {

		const response = {
			type: this.key,
			visualization_id: this.visualizations.value[0],
			joins: [],
			columns: [],
		};

		for(const join of this.container.querySelectorAll('.join')) {
			response.joins.push({
				sourceColumn: join.querySelector('select[name=sourceColumn]').value,
				function: join.querySelector('select[name=function]').value,
				streamColumn: join.querySelector('input[name=streamColumn]').value,
			});
		}

		for(const column of this.container.querySelectorAll('.column')) {
			response.columns.push({
				stream: column.querySelector('select[name=stream]').value,
				column: column.querySelector('input[name=column]').value,
				function: column.querySelector('select[name=function]').value,
				name: column.querySelector('input[name=name]').value,
			});
		}

		if(!response.columns.length)
			return null;

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

		label.querySelector('input').checked = this.exclude || '';

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

		this.multiSelect.value = value.length ? value : this.columns || [];
	}

	get json() {

		return {
			type: this.key,
			columns: this.multiSelect.value,
			exclude: this.container.querySelector('label input[name="exclude"]').checked,
		};
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

		for(const column of this.columns || [])
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

		const response = {
			type: this.key,
			columns: [],
		};

		for(const column of this.container.querySelectorAll('.column')) {

			response.columns.push({
				column: column.querySelector('select[name=column]').value,
				order: column.querySelector('select[name=order]').value,
				numeric: column.querySelector('select[name=numeric]').value,
				caseFirst: column.querySelector('select[name=caseFirst]').value,
			});
		}

		if(!response.columns.length)
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

		if (!this.columns) {

			this.columns = {
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

			this.extrapolateUnits.value = this.columns.extrapolate || 0;
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

		if (this.columns.x && this.multiSelectX.datalist.filter(x => x.value == this.columns.x)) {

			this.multiSelectX.value = this.columns.x;
		}

		this.multiSelectY.datalist = JSON.parse(JSON.stringify(datalist)).filter(x => x.value != this.columns.x);

		this.multiSelectY.render();

		if (this.columns.y && this.multiSelectY.datalist.filter(x => x.value == this.columns.y)) {

			this.multiSelectY.value = this.columns.y;
		}

		this.multiSelectX.on('change', () => {

			if (!(this.multiSelectX.value && this.multiSelectX.value.length)) {

				return;
			}

			const multiselectXValue = this.multiSelectX.value;
			this.multiSelectY.datalist = this.multiSelectX.datalist.filter(x => x.value != multiselectXValue);

			this.multiSelectY.render();
			this.multiSelectY.value = this.multiSelectY.value || this.columns.y;

		});
	}

	get json() {

		const value = this.multiSelectY.value[0]

		return {
			type: this.key,
			columns: {
				x: this.multiSelectX.value[0],
				y: this.multiSelectY.value[0],
				name: value ? (this.multiSelectY.datalist.filter(x => value == x.value))[0].name : '',
				extrapolate: this.extrapolateUnits.value
			},
		};
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
				<input type="text" name="column" value="${this.column || ''}">
			</label>

			<label>
				<span>Formula</span>
				<textarea name="formula">${this.formula || ''}</textarea>
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

		return {
			type: this.key,
			column: this.container.querySelector('label input[name="column"]').value,
			formula: this.container.querySelector('label textarea[name="formula"]').value,
		};
	}
});

ReportTransformation.types.set('forecast', class ReportTransformationRestrictColumns extends ReportTransformation {

	constructor(...parameters) {

		super(...parameters);

		this.multiSelectTiming = new MultiSelect({multiple: false, expand: true});
		this.multiSelectOtherColumns = new MultiSelect({multiple: true, expand: true});

		if (!this.columns) {

			this.columns = {};
		}
	}

	get key() {

		return 'forecast'
	}

	get container() {

		if (this.containerElement) {

			return this.containerElement;
		}

		const
			container = super.container.querySelector('.transformation'),
			columns = document.createElement('div'),
			label = document.createElement('label');

		columns.classList.add('columns', 'form');

		const spanTiming = document.createElement('span');
		spanTiming.textContent = 'Timing Column';

		const spanForecastColumns = document.createElement('span');
		spanForecastColumns.textContent = 'Forecast Columns';

		label.classList.add('forecast');

		columns.appendChild(spanTiming);
		columns.appendChild(this.multiSelectTiming.container);
		columns.appendChild(spanForecastColumns);
		columns.appendChild(this.multiSelectOtherColumns.container);

		this.extrapolateUnits = `<input class="extrapolate-units" type="number" step="1" min="0" value=${this.columns.extrapolate || 0}>`;
		this.timingOffset = `<input class="timing-offset" type="number" step="1" max="0" value=${this.columns.timingOffset || 0}>`;
		this.mergeExtrapolation = `<input class="merge-extrapolation" type="checkbox" ${this.columns.mergeExtrapolation ? 'checked' : ''}>`;
		this.hideUpperLimit = `<input class="hide-upper" type="checkbox" ${this.columns.hideUpperLimit ? 'checked' : ''}>`;
		this.hideLowerLimit = `<input class="hide-lower" type="checkbox" ${this.columns.hideLowerLimit ? 'checked' : ''}>`;

		columns.insertAdjacentHTML('beforeend', `<span>Extrapolate X By Units</span>`);
		columns.insertAdjacentHTML('beforeend', this.extrapolateUnits);

		columns.insertAdjacentHTML('beforeend', `<span>X offset</span>`);
		columns.insertAdjacentHTML('beforeend', this.timingOffset);

		const mergeExtrapolationSpan = document.createElement('span');
		mergeExtrapolationSpan.insertAdjacentHTML('beforeend', this.mergeExtrapolation);
		mergeExtrapolationSpan.insertAdjacentHTML('beforeend', `<span>Merge Forecast Column</span>`);

		if(this.columns.mergeExtrapolation) {

			mergeExtrapolationSpan.querySelector('.merge-extrapolation').checked = true;
		}

		const hideUpperLimitSpan = document.createElement('span');
		hideUpperLimitSpan.insertAdjacentHTML('beforeend', this.hideUpperLimit);
		hideUpperLimitSpan.insertAdjacentHTML('beforeend', `<span>Hide Lower Limit Column</span>`);

		if(this.columns.hideUpperLimit) {

			hideUpperLimitSpan.querySelector('.merge-extrapolation').checked = true;
		}

		const hideLowerLimitSpan = document.createElement('span');
		hideLowerLimitSpan.insertAdjacentHTML('beforeend', this.hideLowerLimit);
		hideLowerLimitSpan.insertAdjacentHTML('beforeend', `<span>Hide Upper LimitColumn</span>`);

		columns.appendChild(mergeExtrapolationSpan);
		columns.appendChild(hideUpperLimitSpan);
		columns.appendChild(hideLowerLimitSpan);

		label.appendChild(columns);
		container.appendChild(label);

		this.render();

		return super.container;
	}

	render() {

		const datalist = [];

		for (const column of this.incoming.columns.values()) {

			datalist.push({
				name: column.name,
				value: column.key,
			});
		}

		this.multiSelectTiming.datalist = datalist;

		this.multiSelectTiming.render();

		if (this.columns.timing && this.multiSelectTiming.datalist.filter(x => x.value == this.columns.timing)) {

			this.multiSelectTiming.value = this.columns.timing;
		}

		this.multiSelectOtherColumns.datalist = JSON.parse(JSON.stringify(datalist)).filter(x => x.value != this.columns.timing);

		this.multiSelectOtherColumns.render();

		if (this.columns && this.columns.data && this.columns.data.length && this.multiSelectOtherColumns.datalist.filter(x => this.columns.data.includes(x.value))) {

			this.multiSelectOtherColumns.value = this.columns.data;
		}

		const that = this;

		this.multiSelectTiming.on('change', () => {
			if (that.multiSelectTiming.value && that.multiSelectTiming.value.length) {
				that.multiSelectOtherColumns.datalist = that.multiSelectTiming.datalist.filter(x => x.value != that.multiSelectTiming.value[0]);
				that.multiSelectOtherColumns.render();
				that.multiSelectOtherColumns.value = that.multiSelectOtherColumns.value.length ? that.multiSelectOtherColumns.value : that.columns.data;
			}
		});
	}

	get json() {

		return {
			type: this.key,
			columns: {
				timing: this.multiSelectTiming.value[0],
				data: this.multiSelectOtherColumns.value,
				extrapolate: (this.container.querySelector('.extrapolate-units') || {value: 0}).value,
				offset: (this.container.querySelector('.timing-offset') || {value: 0}).value,
				mergeExtrapolation: (this.container.querySelector('.merge-extrapolation') || {checked: 0}).checked || 0,
				hideUpperLimit: (this.container.querySelector('.hide-upper') || {checked: 0}).checked,
				hideLowerLimit: (this.container.querySelector('.hide-lower') || {checked: 0}).checked,
			},
			backend_transformation: true
		};
	};
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

		if(!this.visualization.format) {

			this.visualization.format = {
				width :'',
				height:'',
				position: ''
			}
		}

		form.classList.add('subform', 'form');

		form.innerHTML = `
			<label class="dashboard_id">
				<span>Dashboard</span>
			</label>

			<label>
				<span>Position</span>
				<input type="number" name="position" value="${(!this.visualization.format ? '' : this.visualization.format.position)}">
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

		Object.assign(this, filter);
	}

	get container() {

		if (this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('fieldset');

		container.innerHTML = `
			<legend>${this.reportFilter.name}</legend>

			<div class="form">

				<label>
					<span class="default">Default</span>
					<select name="default_type">
						<option value="none">None</option>
						<option value="default_value">Default Value</option>
						<option value="offset">Default Value Offset</option>
					</select>

					<input
						type="${this.reportFilter.type}"
						placeholder="${this.reportFilter.default_value != null ? this.reportFilter.default_value : ''}"
						title="${this.reportFilter.default_value}" value="${this.default_value || ''}"
						name="default_value">

					<input
						type="number"
						placeholder="${this.reportFilter.offset != null ? this.reportFilter.offset : '' }"
						value="${this.offset || ''}"
						name="offset">
				</label>

				<label>
					<button class="delete" title="Delete"><i class="far fa-trash-alt"></i></button>
				</label>
			</div>
		`;

		const types = ['hidden', 'column', 'literal'];

		const default_value = container.querySelector('input[name="default_value"]');

		if(this.reportFilter.type == 'datetime')
			default_value.type = 'datetime-local';

		else if(this.reportFilter.type == 'year')
			default_value.type = 'number';

		else if(this.reportFilter.type == 'time')
			default_value.step = '1';

		else if(types.includes(this.reportFilter.type))
			default_value.type = 'text';

		let default_data;

		if(this.reportFilter.default_value)
			default_data = `Default Value = ${this.reportFilter.default_value}`;

		else if(!isNaN(parseFloat(this.reportFilter.offset)))
			default_data = `Default Value Offset = ${this.reportFilter.offset}`;

		if(default_data)
			container.querySelector('.default').insertAdjacentHTML('afterend', `<small>${default_data}</small>`);

		const default_type = container.querySelector('select[name="default_type"]');

		if(this.default_value)
			default_type.value = 'default_value';

		else if(this.offset)
			default_type.value = 'offset';

		else
			default_type.value = 'none';

		this.updateDefaultType();

		default_type.on('change', () => this.updateDefaultType());

		container.querySelector('.delete').on('click', () => {

			this.container.parentElement.removeChild(container);

			this.reportVisualizationFilters.delete(this.filter_id);
			this.reportVisualizationFilters.render();
		});

		return container;
	}

	updateDefaultType() {

		const default_type = this.container.querySelector('select[name="default_type"]');

		this.container.querySelector('input[name="default_value"]').classList.toggle('hidden', default_type.value != 'default_value');
		this.container.querySelector('input[name="offset"]').classList.toggle('hidden', default_type.value != 'offset');
	}

	get json() {

		let
			offset_value = this.container.querySelector('input[name="offset"]').value,
			default_value = this.container.querySelector('input[name="default_value"]').value,
			default_type = this.container.querySelector('select[name="default_type"]').value;

		if(default_type != 'offset')
			offset_value = '';

		if(default_type != 'default_value')
			default_value = '';

		return {
			default_value: default_value,
			filter_id: this.filter_id,
			offset: offset_value,
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

const mysqlKeywords = [
	'SELECT',
	'FROM',
	'WHERE',
	'AS',
	'AND',
	'OR',
	'IN',
	'BETWEEN',
	'DISTINCT',
	'COUNT',
	'GROUP BY',
	'FORCE INDEX',
	'DATE',
	'MONTH',
	'YEAR',
	'YEARMONTH',
	'UNIX_TIMESTAMP',
	'CONCAT',
	'CONCAT_WS',
	'SUM',
	'INTERVAL',
	'DAY',
	'MINUTE',
	'SECOND',
	'DATE_FORMAT',
	'USING',
];

/**
 * Let the user edit a report's saved data.
 *
 * Editing includes:
 *  - Edit row's data.
 *  - Add new rows.
 *  - Delete rows.
 *  - Sorting data by columns.
 */
class EditReportData {

	/**
	 * Return the editor's container.
	 *
	 * @return HTMLElement
	 */
	get container() {

		if(this.tableContainer)
			return this.tableContainer;

		const container = this.tableContainer = document.createElement('section');

		container.classList.add('edit-report-data');

		container.innerHTML = `
			<header class="toolbar">
				<button type="submit"><i class="fas fa-paper-plane"></i> Update Data</button>
			</header>
			<table></table>
		`;

		this.container.querySelector('.toolbar button').on('click', e => {
			e.preventDefault();
			this.save();
		});

		return container;
	}

	/**
	 * Load a given query's data into the editor.
	 *
	 * @param int	query_id	The report id whose data is to be loaded.
	 */
	async load(query_id) {

		this.container.querySelector('table').innerHTML = `<tr class="NA"><td>Loading&hellip;<td></tr>`;

		await DataSource.load();

		if(!DataSource.list.has(query_id))
			throw API.exception('Invalid report ID');

		this.datasource = new DataSource(DataSource.list.get(query_id));

		await this.datasource.fetch();
		this.data = await this.datasource.response();

		this.rows = [];

		for(const item of this.data)
			this.rows.push([...item.values()]);

		this.render();
	}

	/**
	 * Sorts the data by the given column.
	 * This will update this.rows in-place and rende the UI.
	 *
	 * @param int			index	The position of the column
	 * @param HTMLElement	element	The th element that is to be sorted.
	 */
	sort(index, element) {

		if (this.rows.length === 1) {

			return this.rows;
		}

		const order = element.dataset.sorted;

		const asc = order === 'asc', desc = order === 'desc';

		element.dataset.sorted = asc ? 'desc' : 'asc';

		const sortFlag = asc ? -1 : 1;

		if (asc && desc) {

			return this.rows;
		}

		this.rows = this.rows.sort((x, y) => {

			let A = x[index], B = y[index];

			if(parseInt(A))
				A = parseInt(A);

			if(parseInt(B))
				B = parseInt(B);

			if (A < B) {

				return -1 * sortFlag;
			}

			if (A > B) {

				return sortFlag;
			}

			return 0;
		});

		this.render();
	}

	/**
	 * Clears the container and renders the current data into it.
	 */
	render() {

		this.columns = [...this.data[0].keys()];

		const
			table = this.container.querySelector('table'),
			thead = document.createElement('thead'),
			tbody = document.createElement('tbody'),
			tfoot = document.createElement('tfoot'),
			headings = document.createElement('tr');

		table.textContent = null;

		if(!this.data || !this.data.length)
			return table.innerHTML = '<tr class="NA"><td>No data found</td></tr>';

		tbody.setAttribute('contenteditable', '');

		thead.appendChild(headings);

		for(const [index, column] of this.columns.entries()) {

			const th = document.createElement('th');

			th.textContent = column;
			th.dataset.sorted = 'desc';
			th.on('click', () =>this.sort(index, th));

			headings.appendChild(th);
		}

		headings.insertAdjacentHTML('beforeend', `
			<th class="action">Add</th>
			<th class="action">Delete</th>
		`);

		for(const row of this.rows)
			this.addNewRow(row, tbody);

		tfoot.innerHTML = `
			<tr><td colspan="${this.columns.length + 2}">+ Add New Row</td></tr>
		`;

		tfoot.on('click', () => {
			this.addNewRow(new Array(this.columns.length).fill(''), this.container.querySelector('tbody'));
		});

		table.appendChild(thead);
		table.appendChild(tbody);
		table.appendChild(tfoot);
	}

	/**
	 * Adds a new row into the container.
	 * The row can be added next to a current row or at the end.
	 * We need the tbody reference here because the tbody may not necesserily exit in the container yet.
	 *
	 * @param Array			row		The array of row's data that is to be added.
	 * @param HTMLElement	tbody	The tbody reference.
	 * @param HTMLElement	before	The row before which the new row is to be added.
	 */
	addNewRow(row, tbody, before = null) {

		const tr = document.createElement('tr');

		for(const cell of row) {

			const td = document.createElement('td');
			td.textContent = cell;
			tr.appendChild(td);
		}

		tr.insertAdjacentHTML('beforeend', `
			<td class="action green" contenteditable="false" title="Add One Above">+</td>
			<td class="action red" contenteditable="false" title="Delete Row">&times;</td>
		`);

		tr.querySelector('td.green').on('click', () => {
			this.addNewRow(new Array(this.columns.length).fill(''), tbody, tr);
		});

		tr.querySelector('td.red').on('click', () => {

			if(confirm('Are you sure?!'))
				tr.remove();
		});

		if(before)
			tbody.insertBefore(tr, before);

		else tbody.appendChild(tr);
	}

	/**
	 * Saves the current container's contents to the server.
	 */
	async save() {

		const table = this.container.querySelector('table');
		const result = [];

		for (const row of table.querySelectorAll('tbody tr')) {

			const temp = {};

			for (const [index, data] of row.querySelectorAll('td:not(.action)').entries()) {

				temp[this.columns[index]] = data.textContent;
			}

			result.push(temp);
		}

		const
			parameter = {
				data: JSON.stringify(result),
				query_id: this.datasource.query_id,
			},
			options = {
				method: 'POST',
			};

		try {

			await API.call('reports/engine/report', parameter, options);

			new SnackBar({
				message: 'Data saved successfuly',
			});
		}

		catch(e) {

			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message || e,
				type: 'error',
			});
		}
	}
}