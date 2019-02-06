"use strict";

class DataSource {

	static async load(force = false) {

		if(DataSource.list && !force) {
			return;
		}

		const response = await API.call('reports/report/list');

		DataSource.list = new Map(response.map(report => [report.query_id, report]));
	}

	constructor(source, page) {

		for(const key in source) {
			this[key] = source[key];
		}

		if(!this.format) {
			this.format = {};
		}

		if(!this.format.columns) {
			this.format.columns = [];
		}

		this.page = page;

		this.tags = this.tags || '';
		this.tags = this.tags.split(',').filter(a => a.trim());

		this.filters = new DataSourceFilters(this.filters, this);
		this.columns = new DataSourceColumns(this);
		this.transformations = new DataSourceTransformations(this);
		this.pipeline = new DataSourcePipeline(this);
		this.visualizations = [];

		if(!source.visualizations) {
			source.visualizations = [];
		}

		if(!source.visualizations.filter(v => v.type == 'table').length) {
			source.visualizations.push({ name: this.name, visualization_id: 0, type: 'table' });
		}

		source.visualizations = source.visualizations.filter(v => Visualization.list.has(v.type));

		this.visualizations = source.visualizations.map(v => new (Visualization.list.get(v.type))(v, this));
		this.postProcessors = new DataSourcePostProcessors(this);
	}

	async fetch(_parameters = {}) {

		this.pipeline.clear();

		const parameters = new URLSearchParams(_parameters);

		if(typeof _parameters == 'object') {

			for(const key in _parameters) {
				parameters.set(key, _parameters[key]);
			}
		}

		parameters.set('query_id', this.query_id);

		if(this.definitionOverride) {
			parameters.set('query', this.definition.query);
		}

		const autodetectDatasets = [];

		for(const filter of this.filters.values()) {

			if(filter.multiSelect) {

				await filter.fetch();

				const values = filter.multiSelect.value;

				if(filter.multiSelect.datalist.length > 50 && values.length && values.length == filter.multiSelect.datalist.length) {

					autodetectDatasets.push(filter.placeholder);
					continue;
				}

				for(const value of filter.multiSelect.value) {
					parameters.append(DataSourceFilter.placeholderPrefix + filter.placeholder, value);
				}

				filter.submittedValue = filter.multiSelect.value;
			}

			else {
				parameters.set(DataSourceFilter.placeholderPrefix + filter.placeholder, filter.value);
				filter.submittedValue = filter.value;
			}

			if(_parameters.userApplied) {
				filter.changed({state: 'submitted'});
			}
			else if(_parameters.clearFilterChanged) {
				filter.changed({state: 'clear'});
			}
		}

		parameters.set('autodetect_datasets', JSON.stringify(autodetectDatasets));

		const external_parameters = await Storage.get('external_parameters');

		if(Array.isArray(account.settings.get('external_parameters')) && external_parameters) {

			for(const parameter of account.settings.get('external_parameters')) {

				if((parameters.has(parameter.name) && parameters.get(parameter.name) == '') || parameter.name in external_parameters) {

					parameters.set(
						DataSourceFilter.placeholderPrefix + parameter.name,
						external_parameters[parameter.name] == undefined ? parameter.value : external_parameters[parameter.name]
					);
				}
			}
		}

		let response = null;

		const
			params = parameters.toString(),
			options = {
				method: params.length <= 2500 ? 'GET' : 'POST', // 2500 is used as our server was not accepting more then this query param length
			};

		this.resetError();

		if(this.refresh_rate) {

			clearTimeout(this.refreshRateTimeout);

			this.refreshRateTimeout = setTimeout(() => {
				if(this.containerElement && document.body.contains(this.container)) {
					this.visualizations.selected.load();
				}
			}, this.refresh_rate * 1000);
		}

		try {
			response = await API.call('reports/engine/report', params, options);
		}

		catch(e) {

			response = {};

			let message = e.message;

			if(typeof e.body == 'object') {

				message = message.replace('You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use', '');
				this.error(JSON.stringify(message, 0, 4));

				throw e;
			}
			else {

				this.error('Click here to retry', {retry: true});
				throw e;
			}
		}

		if(parameters.get('download'))
			return response;

		this.originalResponse = response;

		this.pipeline.add(new DataSourcePipelineEvent({
			title: 'Report Executed',
			subtitle: [
				{key: 'Duration', value: `${Format.number(response.runtime)}ms`},
				{key: 'Rows', value: Format.number(response.data.length)},
				{key: 'Columns', value: Format.number(Object.keys(response.data[0] || {}).length)},
			],
		}));

		this.columns.update();
		this.postProcessors.update();
		this.render();
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		this.containerElement = document.createElement('section');

		const container = this.containerElement;

		container.classList.add('data-source');

		container.innerHTML = `

			<header>
				<h2>
					<span class="title">${this.name}</span>
					<a class="menu-toggle" title="Menu"><i class="fa fa-angle-down"></i></a>
				</h2>
				<div class="actions right"></div>
			</header>

			<div class="columns"></div>
			<div class="drilldown hidden"></div>

			<div class="query overlay hidden">
				<code></code>
				<div class="close">&times;</div>
			</div>

			<div class="description overlay hidden">
				<div class="body"></div>
				<div class="footer hidden">

					<span>
						<span class="label">Added:</span>
						<span title="${Format.date(this.created_at)}">${Format.ago(this.created_at)}</span>
					</span>

					<span>
						<span class="label">Cached:</span>
						<span class="cached"></span>
					</span>

					<span>
						<span class="label">Runtime:</span>
						<span class="runtime"></span>
					</span>

					<span class="right visible-to hidden">
						<span class="label">Visible To</span>
						<span class="count"></span>
					</span>

					<span>
						<span class="label">Added By:</span>
						<span>${this.added_by_name ? `<a href="/user/profile/${this.added_by}" target="_blank">${this.added_by_name}</a>` : 'Unknown User'}</span>
					</span>

					<span>
						<span>&nbsp;</span>
						<a class="api-documentation">API documentation</a>
					</span>
				</div>
				<div class="close">&times;</div>
			</div>
		`;

		const menuToggle = container.querySelector('header .menu-toggle');

		container.querySelector('.api-documentation').on('click', async () => {

			if(this.apiDocumentationDialogueBox) {
				return this.apiDocumentationDialogueBox.show();
			}

			const resultUrl = new URLSearchParams();

			resultUrl.set('query_id', this.query_id);
			resultUrl.set('refresh_token', await Storage.get('refresh_token'));
			resultUrl.set('token', (await Storage.get('token')).body);

			for(const entry of this.filters.values()) {

				if(entry.placeholder != 'daterange') {
					resultUrl.set('param_' + entry.placeholder, entry.default_value);
				}
			}

			this.apiDocumentationDialogueBox = new DialogBox();
			this.apiDocumentationDialogueBox.container.querySelector('section').classList.add('api-documentation');

			this.apiDocumentationDialogueBox.heading = 'API Documentation';

			this.apiDocumentationDialogueBox.body.innerHTML = `

				<h4>Endpoint</h4>
				<pre class="url">${location.origin}/api/v2/reports/engine/report</pre>

				<h4>Required Parameters</h4>
				<p class="NA">The parameters needed to fetch data from a report.</p>
				<table class="static">
					<thead>
						<tr>
							<th>Name</th>
							<th>Key</th>
							<th>Description</th>
							<th>Expiry time</th>
						</tr>
					</thead>

					<tbody>
						<tr>
							<td>Query Id</td>
							<td>query_id</td>
							<td>The query_id for which the response is required.</td>
							<td></td>
						</tr>
						<tr>
							<td>Refresh Token</td>
							<td>refresh_token</td>
							<td>This is the long term token.</td>
							<td>7 Days</td>
						</tr>
						<tr>
							<td>Token</td>
							<td>token</td>
							<td>This is the token which is generated from long term token in every 5 minutes.</td>
							<td>5 Minutes</td>
						</tr>
					</tbody>
				</table>

				<h4>Report Parameters</h4>
				<p class="NA">Report specific parameters that usually filter the data.</p>
				<table class="report-parameter static">
					<thead>
						<tr>
							<th>Name</th>
							<th>Key</th>
							<th>Default Value</th>
							<th>Description</th>
							<th>Type</th>
							<th>Multiple</th>
						</tr>
					</thead>

					<tbody></tbody>
				</table>

				<h4>Request Url</h4>
				<pre class="request url"></pre>
			`;

			this.apiDocumentationDialogueBox.body.querySelector('.request.url').textContent = `${location.origin}/api/v2/reports/engine/report?${resultUrl}`;

			const tbody = this.apiDocumentationDialogueBox.body.querySelector('.report-parameter tbody');

			if(this.filters.size) {

				for(const entry of this.filters.values()) {

					if(entry.placeholder == 'daterange') {
						continue;
					}

					const tr = document.createElement('tr');
					tr.innerHTML = `
						<td>${entry.name}</td>
						<td>${entry.placeholder}</td>
						<td>${entry.default_value || ''}</td>
						<td>${entry.description || ''}</td>
						<td>${entry.type}</td>
						<td>${entry.multiple ? 'Yes' : 'No'}</td>
					`;

					tbody.appendChild(tr);
				};
			}
			else {
				tbody.innerHTML = '<tr><td class="NA" colspan="6">No Filters Found</td></tr>';
			}

			this.apiDocumentationDialogueBox.show();
		});

		menuToggle.on('click', e => {

			e.stopPropagation();

			if(!container.contains(this.menu)) {
				container.appendChild(this.menu);
			}

			const alreadyVisibleMenu = this.container.parentElement.querySelector('.data-source > .menu:not(.hidden)');

			if(alreadyVisibleMenu && alreadyVisibleMenu != this.menu) {
				alreadyVisibleMenu.classList.add('hidden');
			}

			this.menu.classList.toggle('hidden');
			this.menu.style.left = menuToggle.offsetLeft + 'px';
			menuToggle.classList.toggle('selected');
			this.postProcessors.render();

			document.body.removeEventListener('click', this.menuToggleListener);

			if(!this.menu.classList.contains('hidden')) {

				document.body.on('click', this.menuToggleListener = e => {

					const allVisibleMenu = this.container.parentElement.querySelectorAll('.data-source > .menu:not(.hidden)');

					for(const item of allVisibleMenu) {
						item.parentElement.querySelector('.menu-toggle').click();
					}
				});
			}
		});

		if(this.editable) {

			container.querySelector('.description .footer').classList.remove('hidden');

			container.querySelector('.description .visible-to .count').on('click', () => {

				if(this.dialogue) {
					return this.dialogue.show();
				}

				this.dialogue = new DialogBox();

				this.dialogue.heading = 'Users';

				const user_element = [];

				for(const user of this.visibleTo) {
					user_element.push(`
						<li>
							<a href="/user/profile/${user.user_id}">${user.name}</a>
							<span>${user.reason}</span>
						</li>
					`);
				}

				this.dialogue.body.insertAdjacentHTML('beforeend', `<ul class="user-list">${user_element.join('')}</ul>`);
				this.dialogue.show();
			});
		}

		container.querySelector('.description .close').on('click', () => container.querySelector('.menu .description-toggle').click());
		container.querySelector('.query .close').on('click', () => container.querySelector('.menu .query-toggle').click());

		if(this.visualizations.length) {

			for(const visualization of this.visualizations) {

				if(visualization.default) {
					this.visualizations.selected = visualization;
				}
			}

			if(!this.visualizations.selected) {
				this.visualizations.selected = Array.from(this.visualizations)[0];
			}

			if(this.visualizations.selected) {
				container.appendChild(this.visualizations.selected.container);
			}
		}

		if(this.drilldown) {

			let source = this;

			const list = container.querySelector('.drilldown');

			list.textContent = null;

			while(source.drilldown) {

				const
					copy = source,
					fragment = document.createDocumentFragment(),
					link = document.createElement('a')

				link.innerHTML = `${source.drilldown.parent.name}`;

				const title = [];

				for(const p of source.drilldown.parameters) {
					title.push(`${source.drilldown.parent.filters.has(p.placeholder) ? source.drilldown.parent.filters.get(p.placeholder).name : p.placeholder}: ${p.selectedValue}`);
				}

				link.title = title.join('\n');

				link.on('click', () => {

					const parent = this.container.parentElement;

					parent.removeChild(this.container);
					parent.appendChild(copy.drilldown.parent.container);
					copy.drilldown.parent.visualizations.selected.render();
				});

				fragment.appendChild(link);

				if(list.children.length) {

					const angle = document.createElement('i');

					angle.classList.add('fas', 'fa-angle-right');

					fragment.appendChild(angle);

					list.insertBefore(fragment, list.children[0]);
				}

				else {
					list.appendChild(fragment);
				}

				source = source.drilldown.parent;
			}
		}

		this.columns.render();

		return container;
	}

	get menu() {

		if(this.menuElement) {
			return this.menuElement;
		}

		const menu = this.menuElement = document.createElement('div');

		menu.classList.add('menu', 'hidden');

		menu.innerHTML = `

			<div class="item hidden">
				<span class="label filters-toggle"><i class="fa fa-filter"></i> Filters</span>
			</div>

			<div class="item">
				<span class="label description-toggle"><i class="fa fa-info"></i> Info</span>
			</div>

			<div class="item">
				<span class="label pipeline-toggle"><i class="fas fa-sitemap"></i> Pipeline</span>
			</div>

			<div class="item">
				<span class="label change-visualization"><i class="fas fa-chart-line"></i> Visualizations</span>
				<div class="submenu"></div>
			</div>

			<div class="item hidden">
				<span class="label related-visualizations"><i class="fas fa-link"></i> Related Visualizations</span>
			</div>

			<div class="item">

				<span class="label download" title="Download Report"><i class="fa fa-download"></i> Download</span>

				<div class="submenu">

					<div class="item" title="Get the data that includes any transformations that were applied after execution in a CSV format">
						<span class="label csv-download"><i class="far fa-file-excel"></i> CSV</label>
					</div>

					<div class="item" title="Get the data that includes any filters or transformations that were applied locally after execution in a CSV format">
						<span class="label filtered-csv-download"><i class="far fa-file-excel"></i> Filtered CSV</label>
					</div>

					<div class="item" title="Get the raw data as it was recieved immediately after execution as a MS Excel file">
						<span class="label xlsx-download"><i class="fas fa-file-excel"></i> XLSX</label>
					</div>

					<div class="item" title="Get the data that includes any transformations that were applied after execution in a JSON format">
						<span class="label json-download"><i class="fas fa-code"></i> JSON</label>
					</div>

					<div class="item" title="Get the data that includes any filters or transformations that were applied locally after execution in a JSON format">
						<span class="label filtered-json-download"><i class="fas fa-code"></i> Filtered JSON</label>
					</div>
				</div>
			</div>

			<div class="item view hidden">
				<span class="label expand-toggle"><i class="fas fa-expand-arrows-alt"></i> Expand</span>
			</div>

			<div class="item hidden">
				<a class="label configure-visualization">
					<i class="fas fa-cog"></i>
					<span>Configure</span>
				</a>
			</div>

			<div class="item hidden">
				<a class="label define-visualization" href="/reports/define-report/${this.query_id}">
					<i class="fas fa-pencil-alt"></i>
					<span>Define</span>
				</a>
			</div>

			<div class="item hidden">
				<span class="label query-toggle"><i class="fas fa-file-alt"></i> Query</span>
			</div>

			<div class="item" title="Hold alt + click for disabling cache">
				<span class="label reload"><i class="fas fa-sync"></i> Reload</span>
			</div>
		`;

		const toggleOverlay = overlay => {

			for(const toggle of [filtersToggle, queryToggle, descriptionToggle, pipelineToggle]) {

				if(overlay != toggle && toggle.parentElement.classList.contains('selected')) {
					toggle.click();
				}
			}

			overlay.parentElement.classList.toggle('selected');

			this.visualizations.selected.container.classList.toggle('blur');
			this.container.querySelector('.columns').classList.toggle('blur');

			if(this.container.querySelector('.postprocessors-state')) {
				this.container.querySelector('.postprocessors-state').classList.toggle('blur');
			}
		};

		const
			filtersToggle = menu.querySelector('.filters-toggle'),
			descriptionToggle = menu.querySelector('.description-toggle'),
			pipelineToggle = menu.querySelector('.pipeline-toggle'),
			queryToggle = menu.querySelector('.query-toggle'),
			relatedVisualizations = menu.querySelector('.related-visualizations');

		if(this.visualizations.selected.related_visualizations && this.visualizations.selected.related_visualizations.length) {

			relatedVisualizations.parentElement.classList.remove('hidden');
		}

		if(this.editable) {

			const elementsToShow = [
				'.menu .expand-toggle',
				'.menu .query-toggle',
				'.menu .define-visualization',
			];

			for(const element of elementsToShow) {
				menu.querySelector(element).parentElement.classList.remove('hidden');
			}
		}

		if(this.visualizations.selected.editable)
			menu.querySelector('.menu .configure-visualization').parentElement.classList.remove('hidden');

		menu.querySelector('.reload').on('click', e => {

			const options = {};

			if(e.altKey) {
				options.cached = 0;
			}

			this.visualizations.selected.load(options);

			if(e.altKey) {
				new SnackBar({message: 'Report Reloaded Without Cache.'});
			}
		});

		relatedVisualizations.on('click', async () => {

			await this.visualizations.selected.showSubVisualizations();
		});

		filtersToggle.on('click', () => {

			if(!this.formContainer) {

				const element = this.formContainer = document.createElement('div');

				element.classList.add('overlay');

				element.insertAdjacentElement('afterbegin', this.filters.container);

				element.insertAdjacentHTML('beforeend', '<div class="close">&times;</div>');

				this.formContainer.querySelector('.close').on('click', () => filtersToggle.click());

				this.container.appendChild(this.formContainer);
			}

			this.formContainer.classList.toggle('hidden', filtersToggle.parentElement.classList.contains('selected'));

			toggleOverlay(filtersToggle);
		});

		// If there are filters and every filter is not of hidden type then show the filters toggle
		if(this.filters.size && !Array.from(this.filters.values()).every(f => f.type == 'hidden')) {
			filtersToggle.parentElement.classList.remove('hidden');
		}

		descriptionToggle.on('click', async () => {

			this.container.querySelector('.description').classList.toggle('hidden');

			toggleOverlay(descriptionToggle);
		});

		pipelineToggle.on('click', async () => {

			if(!this.container.contains(this.pipeline.container))
				this.container.appendChild(this.pipeline.container);

			this.pipeline.container.classList.toggle('hidden');
			this.pipeline.render();

			toggleOverlay(pipelineToggle);
		});

		queryToggle.on('click', () => {

			this.container.querySelector('.query').classList.toggle('hidden');
			toggleOverlay(queryToggle);
		});

		menu.insertBefore(this.postProcessors.container, menu.querySelector('.change-visualization').parentElement);

		menu.querySelector('.csv-download').on('click', e => this.download(e, {mode: 'csv'}));
		menu.querySelector('.filtered-csv-download').on('click', e => this.download(e, {mode: 'filtered-csv'}));
		menu.querySelector('.json-download').on('click', e => this.download(e, {mode: 'json'}));
		menu.querySelector('.filtered-json-download').on('click', e => this.download(e, {mode: 'filtered-json'}));
		menu.querySelector('.xlsx-download').on('click', e => this.download(e, {mode: 'xlsx'}));

		menu.querySelector('.expand-toggle').on('click', e => {

			let url = '/report/' + this.query_id;

			if(this.visualizations.selected.visualization_id) {
				url = '/visualization/' + this.visualizations.selected.visualization_id;
			}

			window.open(url, e.ctrlKey || e.metaKey ? '_blank' : '_self')
		});

		if(this.visualizations.length) {

			const changeVisualization = menu.querySelector('.change-visualization');

			for(const visualization of this.visualizations) {

				const item = document.createElement('div');

				item.classList.add('item');

				item.on('click', () => {

					if(descriptionToggle.parentElement.classList.contains('selected')) {
						descriptionToggle.click();
					}

					if(queryToggle.parentElement.classList.contains('selected')) {
						queryToggle.click();
					}

					if(filtersToggle.parentElement.classList.contains('selected')) {
						filtersToggle.click();
					}

					if(pipelineToggle.parentElement.classList.contains('selected')) {
						pipelineToggle.click();
					}

					this.menu.querySelector('.related-visualizations').parentElement.classList.toggle('hidden', !(visualization.related_visualizations && visualization.related_visualizations.length));

					visualization.load();
				});

				item.dataset.id =  visualization.visualization_id;

				item.innerHTML = `
					<div class="label">
						<span class="no-icon">
							${visualization.name}<br>
							<span class="NA">${visualization.type}</span>
						</span>
					</div>
				`;

				changeVisualization.parentElement.querySelector('.submenu').appendChild(item);
			}

			if(this.visualizations.length > 1) {
				changeVisualization.classList.remove('hidden');
			}
		}

		if(this.visualizations.selected.visualization_id) {
			menu.querySelector('.configure-visualization').href = `/reports/configure-visualization/${this.visualizations.selected.visualization_id}`;
		}

		for(const submenu of menu.querySelectorAll('.item > .submenu')) {

			submenu.parentElement.on('mouseenter', () => {
				clearTimeout(submenu.leaveTimeout);
				submenu.enterTimeout = setTimeout(() => submenu.classList.add('show'), 400);
			});

			submenu.parentElement.on('mouseleave', () => {
				clearTimeout(submenu.enterTimeout);
				submenu.leaveTimeout = setTimeout(() => submenu.classList.remove('show'), 400);
			});
		}

		return menu;
	}

	async userList() {

		if(this.visibleTo) {
			return this.visibleTo;
		}

		this.visibleTo =  await API.call('reports/report/userPrvList', {report_id : this.query_id});
	}

	async response({implied} = {}) {

		// Empty out the pipeline
		for(const event of this.pipeline) {

			if(event.title != 'Report Executed') {
				this.pipeline.delete(event);
			}
		}

		this.resetError();

		if(!this.originalResponse || !this.originalResponse.data) {
			return [];
		}

		let response = [];

		if(!Array.isArray(this.originalResponse.data)) {
			return [];
		}

		const data = await this.transformations.run(this.originalResponse.data, implied);

		if(!this.columns.list.size) {
			return this.error();
		}

		for(const row of data || []) {
			response.push(new DataSourceRow(row, this));
		}

		if(this.postProcessors.selected) {

			const time = performance.now();

			response = this.postProcessors.selected.processor(response);

			this.pipeline.add(new DataSourcePipelineEvent({
				title: `${this.postProcessors.selected.name} (${this.postProcessors.selected.domain.get(this.postProcessors.selected.value) || this.postProcessors.selected.value})`,
				subtitle: [
					{key: 'Duration', value: `${Format.number(performance.now() - time)}ms`},
					{key: 'Rows', value: Format.number(response.length)},
				],
			}));
		}

		return response;
	}

	async download(e, what) {

		this.containerElement.querySelector('.menu .download').classList.remove('selected');

		let
			str = [],
			response;

		if(!(['filtered-json', 'filtered-csv'].includes(what.mode))) {
			response = await this.fetch({download: 1});
		}

		if(what.mode == 'filtered-json' || what.mode == 'json') {

			const response = await this.response({implied: what.mode == 'json'});

			for(const data of response) {

				const rowObj = {};

				for(let [key, value] of data) {

					rowObj[key] = value;
				}

				str.push(rowObj);
			}

			str = JSON.stringify(str);

			what.mode = 'json';
		}

		else if(what.mode == 'xlsx' && this.xlsxDownloadable) {

			const response = [];

			for(const row of await this.response()) {

				const temp = {};
				const arr = [...row];
				for(const cell of arr) {
					temp[cell[0]] = cell[1];
				}

				response.push(temp)
			}

			const obj = {
				columns :[...this.columns.entries()].map(x => x[0]),
				visualization: this.visualizations.selected.type,
				sheet_name :this.name.replace(/[^a-zA-Z0-9]/g,'_'),
				file_name :this.name.replace(/[^a-zA-Z0-9]/g,'_'),
				token : (await Storage.get('token')).body,
				show_legends: !this.visualizations.selected.options.hideLegend || 0,
				show_values: this.visualizations.selected.options.showValues || 0,
				classic_pie: this.visualizations.selected.options.classicPie
			};

			for(const axis of this.visualizations.selected.options.axes || []) {
				if(axis.columns.length) {
					obj[axis.position] = axis.columns[0].key;
				}
			}

			return await this.excelSheetDownloader(response, obj);
		}

		else if(what.mode == 'filtered-csv' || what.mode == 'csv') {

			const response = await this.response({implied: what.mode == 'csv'});

			for(const row of response) {

				const line = [];

				for(const value of row.values()) {
					line.push(JSON.stringify(String(value === null ? '' : value).replace(/"/g,"'")));
				}

				str.push(line.join());
			}

			str = Array.from(response[0].keys()).join() + '\r\n' + str.join('\r\n');

			what.mode = 'csv';
		}

		const
			a = document.createElement('a'),
			blob = new Blob([str], {type: 'application\/octet-stream'}),
			fileName = [
				this.name,
			],
			values = {};

		for(const [name, filter] of this.filters) {

			if(filter.type == 'daterange' && !values.date_range) {

				values.date_range = {};

				const
					[startFilter] = filter.companions.filter(x => x.name.toLowerCase().includes('start')),
					[endFilter] = filter.companions.filter(x => x.name.toLowerCase().includes('end'));

				values.date_range.start = startFilter ? Format.date(this.filters.container.elements[startFilter.placeholder].value) : Format.date(new Date());
				values.date_range.end = endFilter ? Format.date(this.filters.container.elements[endFilter.placeholder].value) : Format.date(new Date());
			}
			else if (filter.type == 'date' && !values.date) {

				values.date = Format.date(this.filters.container.elements[filter.placeholder].value);
			}
			else if (filter.type == 'month' && !values.month) {

				values.month = Format.month(this.filters.container.elements[filter.placeholder].value);
			}
			else if (filter.type == 'datetime' && !values.date_time) {

				values.date_time = Format.dateTime(this.filters.container.elements[filter.placeholder].value);
			}
		}

		if(values.date_range) {

			fileName.push(values.date_range.start, values.date_range.end);
		}
		else if(values.date) {

			fileName.push(values.date);
		}
		else if(values.month) {

			fileName.push(values.month);
		}
		else if(values.date_time) {

			fileName.push(values.date_time);
		}

		if(fileName.length == 1) {
			fileName.push(new Intl.DateTimeFormat('en-IN', {year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'}).format(new Date));
		}

		a.href = window.URL.createObjectURL(blob);

		a.download = fileName.join(' - ') + '.' + what.mode;

		a.classList.add('hidden');

		document.querySelector('body').appendChild(a);

		a.click();
		a.remove();
	}

	get xlsxDownloadable() {

		if(!account.features.has('export_xlsx') || !this.visualizations.selected || !MetaData.visualizations.has(this.visualizations.selected.type)) {
			return false;
		}

		return MetaData.visualizations.get(this.visualizations.selected.type).excel_format;
	}

	async excelSheetDownloader(data, obj) {

		obj.data = data;

		const xlsxBlobOutput = await (await (fetch("/api/v2/reports/engine/download", {
			body: JSON.stringify(obj),
			headers: {
				'content-type': 'application/json'
			},
			method: 'POST',
		}))).blob();

		const link = document.createElement('a');
		link.classList.display = 'none';
		page.container.appendChild(link);

		link.href = window.URL.createObjectURL(xlsxBlobOutput);
		link.download = (obj.file_name + "_" + new Date().toString()).replace(/ /g, "_") + ".xlsx";

		link.click();
		link.remove();
	}

	get link() {

		const link = window.location.origin + '/report/' + this.query_id;

		const parameters = new URLSearchParams();

		for(const [_, filter] of this.filters) {
			if(this.filters.container && filter.placeholder in this.filters.container.elements) {
				parameters.set(filter.placeholder, this.filters.container.elements[filter.placeholder].value);
			}
		}

		return link + '?' + parameters.toString();
	}

	resetError() {

		if(this.container.querySelector('pre.warning')) {
			this.container.removeChild(this.container.querySelector('pre.warning'));
		}

		this.visualizations.selected.container.classList.remove('hidden');
	}

	error(message = '', {retry = false} = {}) {

		if(this.container.querySelector('pre.warning')) {
			return;
		}

		this.resetError();

		this.container.insertAdjacentHTML('beforeend', `
			<pre class="warning">
				<h2>No Data Found!</h2>
				<span>${message}</span>
			</pre>
		`);

		if(retry) {

			const pre = this.container.querySelector('.warning');
			pre.classList.add('retry');

			pre.on('click', () => this.visualizations.selected.load());
		};

		this.visualizations.selected.container.classList.add('hidden');
	}

	render() {

		const drilldown = [];

		for(const column of this.columns.values()) {

			if(column.drilldown && column.drilldown.query_id) {
				drilldown.push(column.name);
			}
		}

		if(drilldown.length) {

			const
				actions = this.container.querySelector('header .actions'),
				old = actions.querySelector('.drilldown');

			if(!old) {

				actions.insertAdjacentHTML('beforeend', `
					<span class="grey drilldown" title="Drilldown available on: ${drilldown.join(', ')}">
						<i class="fas fa-angle-double-down"></i>
					</span>
				`);
			}
		}

		const description = this.container.querySelector('.description .body');
		description.textContent = null;

		description.classList.remove('NA');
		if (!this.description && !this.visualizations.selected.description) {
			description.classList.add('NA');
			description.innerHTML = 'No description found!';
		}
		else {
			if (this.description) {
				description.insertAdjacentHTML('beforeend', '<h3>Report Description</h3>' + this.description);
			}

			if (this.visualizations.selected.description) {
				description.insertAdjacentHTML('beforeend', '<h3>Visualization Description</h3>' + this.visualizations.selected.description);
			}
		}

		for(const item of this.menu.querySelectorAll('.change-visualization + .submenu .item')) {
			item.classList.toggle('selected', item.dataset.id == this.visualizations.selected.visualization_id);
		}

		this.container.querySelector('.query code').innerHTML = new FormatSQL(this.originalResponse.query).query;

		let age = this.originalResponse.cached ? Math.floor(this.originalResponse.cached.age * 100) / 100 : 0;

		if(age < 1000) {
			age += 'ms';
		}

		else if(age < 1000 * 60) {
			age = Format.number((age / 1000)) + 's';
		}

		else if(age < 1000 * 60 * 60) {
			age = Format.number((age / (1000 * 60))) + 'h';
		}

		let runtime = Math.floor(this.originalResponse.runtime * 100) / 100;

		if(runtime < 1000) {
			runtime += 'ms';
		}

		else if(runtime < 1000 * 60) {
			runtime = (runtime / 1000) + 's';
		}

		else if(runtime < 1000 * 60 * 60) {
			runtime = (runtime / (1000 * 60)) + 'h';
		}

		this.container.querySelector('.description .cached').textContent = this.originalResponse.cached && this.originalResponse.cached.status ? age : 'No';
		this.container.querySelector('.description .runtime').textContent = runtime;

		this.menu.querySelector('.xlsx-download').classList.toggle('hidden', !this.xlsxDownloadable);

		this.columns.render();
	}

	get json() {

		const response = {};

		for(const key in this) {

			if(typeof this[key] != 'object') {
				response[key] = this[key];
			}
		}

		response.format = JSON.stringify(this.format);
		response.definition = JSON.stringify(this.definition);
		response.tags = this.tags.join();
		response.filters = [];
		response.visualizations = [];

		for(const filter of this.filters.values()) {

			const newFilter = {};

			for(const key in filter) {

				if(typeof filter[key] != 'object') {
					newFilter[key] = filter[key];
				}
			}

			response.filters.push(newFilter);
		}

		for(const visualization of this.visualizations.values()) {

			const newVisualization = {};

			for(const key in visualization) {

				if(typeof visualization[key] != 'object') {
					newVisualization[key] = visualization[key];
				}
			}

			newVisualization.options = JSON.stringify(visualization.options);

			response.visualizations.push(newVisualization);
		}

		return JSON.parse(JSON.stringify(response));
	}
}

/**
 * A group of DataSource filters.
 * This class provides the container and a submit mechanism to load the report.
 */
class DataSourceFilters extends Map {

	/**
	 * Generate a list of DataSourceFilter objects in the ideal order. This does a few more things.
	 *
	 * - Group the date ranges together.
	 * - Create a new date range filter to accompany any date range pairs.
	 * - Generate the DataSourceFilter objects and attach them to the class with placeholder as the key.
	 *
	 * @param Array			filters	A list of filters and their properties.
	 * @param DataSource	source	The owner DataSource object. Optional because we can have a filter list independently from the source.
	 */
	constructor(filters, source = null) {

		super();

		this.source = source;

		if(!filters || !filters.length) {
			return;
		}

		filters = new Map(filters.map(f => [f.placeholder, f]));

		// Create a Map of different date filter pairs
		const filterGroups = new Map;

		// Place the date filters alongside their partners in the map
		// The goal is to group together the start and end dates of any one filter name
		for(const filter of filters.values()) {

			if(filter.type != 'date' || (!filter.name.toLowerCase().includes('start') && !filter.name.toLowerCase().includes('end'))) {
				continue;
			}

			// Remove the 'start', 'end', 'date' and spaces to create a name that would (hopefuly) identify the filter pairs.
			const
				name = filter.name.replace(/(start|end|date|_)/ig, '').trim(),
				placeholder = filter.placeholder.replace(/(start|end|date)/ig, '').trim();

			if(!filterGroups.has(name)) {

				filterGroups.set(name, [{
					filter_id: Math.random(),
					name: name + ' Date Range',
					placeholder: placeholder + '_date_range',
					placeholders: [placeholder + '_date_range'],
					order: filter.order,
					type: 'daterange',
					companions: [],
				}]);
			}

			const group = filterGroups.get(name);

			group[0].companions.push(filter);
			filter.order = group[0].order;

			group.push(filter);
		}

		// Remove any groups that don't have a start and end date (only)
		for(const [name, group] of filterGroups) {

			if(!group.some(f => f.name.toLowerCase().includes('start')) || !group.some(f => f.name.toLowerCase().includes('end'))) {
				filterGroups.delete(name);
			}
		}

		// Go through each filter group and sort by the name to bring start filter before the end.
		// And also add them to the master global filter list to bring them together.
		for(let filterGroup of filterGroups.values()) {

			// Make sure the Date Range filter comes first, followed by start date and then finally the end date.
			filterGroup = filterGroup.sort((a, b) => {

				if(a.type == 'daterange') {
					return -1;
				}

				if(a.name.toLowerCase().includes('start') && b.type != 'daterange') {
					return -1;
				}

				return 1;
			});

			for(const filter of filterGroup) {
				filters.delete(filter.placeholder);
				filters.set(filter.placeholder, filter);
			}
		}

		for(const filter of filters.values()) {
			this.set(filter.placeholder, new DataSourceFilter(filter, this));
		}
	}

	/**
	 * The main container of the filters.
	 * This is a lazy loaded list of filter labels and the submit button.
	 *
	 * @return HTMLElement
	 */
	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('form');

		container.classList.add('toolbar', 'form', 'filters');

		for(const filter of this.values()) {

			filter.label.on('click', e => e.stopPropagation());

			container.appendChild(filter.label);
		}

		container.on('submit', this.submitListener = e => {

			e.preventDefault();

			this.apply({userApplied: true});

			if(this.source) {
				this.source.container.querySelector('.filters-toggle').click()
			}
		});

		// To make sure the "Apply" button comes last
		let maxOrder = null;

		for(const filter of this.values()) {

			if(isNaN(parseFloat(filter.order))) {
				continue;
			}

			if(isNaN(parseFloat(maxOrder))) {
				maxOrder = filter.order;
			}

			maxOrder = Math.max(maxOrder, filter.order)
		}

		container.insertAdjacentHTML('beforeend', `

			<label style="order: ${maxOrder + 2};" class="reset-toggle hidden">
				<span>&nbsp;</span>
				<button type="button"><i class="far fa-check-square"></i> All</button>
			</label>

			<label style="order: ${maxOrder + 1};" class="apply">
				<span>&nbsp;</span>
				<button type="submit">
					<i class="fas fa-paper-plane"></i> Apply
				</button>
			</label>
		`);

		{
			const resetButton = container.querySelector('.reset-toggle button');

			resetButton.on('click', () => {

				if(resetButton.textContent.trim() == 'Clear') {

					this.clear();
					resetButton.innerHTML = '<i class="far fa-check-square"></i> All';
				}

				else {

					this.all();
					resetButton.innerHTML = '<i class="far fa-square"></i> Clear';
				}
			});

			for(const filter of this.values()) {

				if(filter.dataset) {
					resetButton.parentElement.classList.remove('hidden');
					break;
				}
			}
		}

		return container;
	}

	/**
	 * Submit the filters values and load the report with the new data.
	 * This only works whent the owner DataSorce object is passed in constructor.
	 */
	async apply() {

		if(!this.source) {
			return;
		}

		this.source.visualizations.selected.load({userApplied: true});

		const toggle = this.source.container.querySelector('.filters-toggle.selected');

		if(toggle) {
			toggle.click();
		}
	}

	clear() {

		for (const filter of this.values()) {

			if (filter.multiSelect) {
				filter.multiSelect.clear();
			}
		}
	}

	all() {

		for (const filter of this.values()) {

			if (filter.multiSelect) {
				filter.multiSelect.all();
			}
		}
	}
}

/**
 * The class representing one single DataSource filter. It has a few responsibilities.
 *
 * - Initialize the label container.
 * - Act as a black box when dealing with fitler value. Lets the user set or get the currnet value of the
 * 	 filter without worrying about the specifics like filter type, default value, current container initialization state etc.
 * - Fetch the report data when the filter as a dataset report attached to it.
 * - Handle special filter types like daterange that affect other filters.
 */
class DataSourceFilter {

	/**
	 * Set up some constant properties.
	 */
	static setup() {

		DataSourceFilter.placeholderPrefix = 'param_';
		DataSourceFilter.timeout = 5 * 60 * 1000;

		DataSourceFilter.dateRanges = [
			{
				start: 0,
				end: 0,
				name: 'Today',
			},
			{
				start: -1,
				end: -1,
				name: 'Yesterday',
			},
			{
				start: -6,
				end: 0,
				name: 'Last 7 Days',
			},
			{
				start: -29,
				end: 0,
				name: 'Last 30 Days',
			},
			{
				start: -89,
				end: 0,
				name: 'Last 90 days',
			},
			{
				start: -365,
				end: 0,
				name: 'Last Year',
			},
		];
	}

	constructor(filter, filters = null) {

		Object.assign(this, filter);

		this.filters = filters;

		if(this.dataset && DataSource.list.has(this.dataset))
			this.multiSelect = new MultiSelect({multiple: this.multiple});

		this.valueHistory = [];

		if(this.type != 'daterange') {
			return;
		}

		this.dateRanges = JSON.parse(JSON.stringify(DataSourceFilter.dateRanges));

		if(account.settings.has('global_filters_date_ranges')) {
			this.dateRanges = account.settings.has('global_filters_date_ranges');
		}

		this.dateRanges.push({name: 'Custom'});
	}

	get label() {

		if(this.labelContainer)
			return this.labelContainer;

		const container = document.createElement('label');

		container.style.order = this.order;

		if(!MetaData.filterTypes.has(this.type)) {
			return container;
		}

		if(this.type == 'hidden') {
			container.classList.add('hidden');
		}

		let input;

		if(this.multiSelect) {
			input = this.multiSelect.container;
			this.multiSelect.on('change', () => this.changed({state: 'changed'}));
		}

		else if(this.type == 'daterange') {

			input = document.createElement('select');

			for(const [index, range] of this.dateRanges.entries()) {
				input.insertAdjacentHTML('beforeend', `<option value="${index}">${range.name}</option>`);
			}

			input.value = this.value;

			input.on('change', () => {
				this.dateRangeUpdate();
				this.changed({state: 'changed'});
			});
		}

		else {

			input = document.createElement('input');

			input.type = MetaData.filterTypes.get(this.type).input_type;
			input.step = 1;
			input.name = this.placeholder;

			input.value = this.value;

			input.on('change', () => this.changed({state: 'changed'}));
		}

		container.innerHTML = `<span>${this.name}</span>`;
		container.appendChild(input);

		// Timing of this is critical
		this.labelContainer = container;

		this.dateRangeUpdate();

		// Empty the cached value which was recieved before the filter container was created.
		delete this.valueCache;

		return container;
	}

	get value() {

		if(this.multiSelect) {
			return this.multiSelect.value;
		}

		if(this.labelContainer) {
			return this.label.querySelector(this.type == 'daterange' ? 'select' : 'input').value;
		}

		// If a value was recieved before the container could be created
		if('valueCache' in this) {
			return this.valueCache;
		}

		// If the filter's type is a date range then it's default value depends on it's companion filters' values
		if(this.type == 'daterange') {

			// The default date range value is the custom value in case no other filter preset matches
			let value = this.dateRanges.length - 1;

			// Find the date range that matches the selected date range values for the current filter's companions
			outer:
			for(const [index, range] of this.dateRanges.entries()) {

				let match = true;

				for(let companion of this.companions || []) {

					companion = this.filters.get(companion.placeholder);

					const
						date = Date.parse(companion.value),
						today = new Date(new Date().toISOString().substring(0, 10)).getTime();

					if(!date) {
						match = false;
						break;
					}

					if(companion.name.toLowerCase().includes('start') && date != today + ((range.start) * 24 * 60 * 60 * 1000)) {
						match = false;
					}

					else if(companion.name.toLowerCase().includes('end') && date != today + ((range.end) * 24 * 60 * 60 * 1000)) {
						match = false;
					}
				}

				if(!match) {
					continue;
				}

				value = index;
				break;
			}

			return value;
		}

		let value = this.default_value;

		if(
			this.filters &&
			this.filters.source &&
			this.filters.source.visualizations.selected &&
			this.filters.source.visualizations.selected.options &&
			this.filters.source.visualizations.selected.options.filters
		) {

			const [visualization_filter] = this.filters.source.visualizations.selected.options.filters.filter(x => x.filter_id == this.filter_id);

			if(visualization_filter && visualization_filter.default_value) {
				return visualization_filter.default_value;
			}

			else if(visualization_filter && visualization_filter.offset) {
				this.offset = visualization_filter.offset;
			}
		}

		if(this.offset && this.offset.length) {
			this.offset.filterType = this.type;
			value = DataSourceFilter.parseOffset(this.offset);
		}

		// If an offset and a default value was provided for the offset then create a new default value
		if(this.type == 'datetime' && this.default_value && value) {
			value = value + 'T' + this.default_value;
		}

		return value;
	}

	set value(value) {

		this.valueHistory.push(value);

		if(this.multiSelect) {
			return this.multiSelect.value = value;
		}

		if(!this.labelContainer) {
			return this.valueCache = value;
		}

		if(this.type == 'daterange') {
			this.label.querySelector('select').value = value;
			this.dateRangeUpdate();
			return;
		}

		this.label.querySelector('input').value = value;
	}

	async fetch() {

		if(!this.dataset || !this.multiSelect) {
			return [];
		}

		await DataSource.load();

		let
			values,
			timestamp;

		const report = new DataSource(DataSource.list.get(this.dataset), window.page);

		if(Array.from(report.filters.values()).some(f => f.dataset == this.dataset)) {
			return [];
		}

		if (await Storage.has(`dataset.${this.dataset}`)) {
			({values, timestamp} = await Storage.get(`dataset.${this.dataset}`));
		}

		if(!timestamp || Date.now() - timestamp > DataSourceFilter.timeout) {

			const
				response = await report.fetch({download: true}),
				values = response.data;

			await Storage.set(`dataset.${this.dataset}`, {values, timestamp: Date.now()});
		}

		({values, timestamp} = await Storage.get(`dataset.${this.dataset}`));

		if(!this.multiSelect.datalist || !this.multiSelect.datalist.length) {
			this.multiSelect.datalist = values;
			this.multiSelect.multiple = this.multiple;
			this.multiSelect.all();
		}

		return values;
	}

	dateRangeUpdate() {

		if(this.type != 'daterange') {
			return;
		}

		const
			select = this.label.querySelector('select'),
			range = this.dateRanges[select.value];

		if(!range) {
			return;
		}

		// Show / hide other companion inputs depending on if custom was picked.
		for(let companion of this.companions || []) {

			companion = this.filters.get(companion.placeholder);

			// If the option was the last one. We don't check the name because
			// the user could have given a custom name in account settings.
			companion.label.classList.toggle('hidden', select.value != this.dateRanges.length - 1);

			companion.order = this.order;

			const date = companion.name.toLowerCase().includes('start') ? range.start : range.end;

			if(date === undefined) {
				continue;
			}

			companion.value = new Date(Date.nowUTC() + date * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
		}
	}

	static parseOffset(offset, base = null) {

		if(Array.isArray(offset)) {

			let value = null;

			for(const entry of offset) {

				entry.filterType = offset.filterType;
				value = DataSourceFilter.parseOffset(entry, value);
			}

			return value;
		}

		if(base) {
			base = new Date(base);
		}
		else {
			base = new Date();
		}

		const offsetValue = offset.value * offset.direction;

		if(offset.unit == 'second') {
			return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate(), base.getHours(), base.getMinutes(), base.getSeconds() + offsetValue)).toISOString().substring(0, 19);
		}

		else if(offset.unit == 'minute') {

			if(offset.snap) {
				return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate(), base.getHours(), base.getMinutes() + offsetValue, 0)).toISOString().substring(0, 19);
			} else {
				return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate(), base.getHours(), base.getMinutes() + offsetValue, base.getSeconds())).toISOString().substring(0, 19);
			}
		}

		else if(offset.unit == 'hour') {

			if(offset.snap) {
				return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate(), base.getHours() + offsetValue, 0, 0)).toISOString().substring(0, 19);
			} else {
				return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate(), base.getHours() + offsetValue, base.getMinutes(), base.getSeconds())).toISOString().substring(0, 19);
			}
		}

		else if(offset.unit == 'day') {

			if(offset.snap) {
				return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate() + offsetValue)).toISOString().substring(0, 10);
			} else {
				return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate() + offsetValue, base.getHours(), base.getMinutes(), base.getSeconds())).toISOString().substring(0, 19)
			}
		}

		else if(offset.unit == 'week') {

			if(offset.snap) {
				return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay() + (offsetValue * 7))).toISOString().substring(0, 10);
			} else {
				return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate() + (offsetValue * 7))).toISOString().substring(0, 10);
			}
		}

		else if(offset.unit == 'month') {

			if(offset.snap) {

				if(offset.filterType == 'month') {
					return new Date(Date.UTC(base.getFullYear(), base.getMonth() + offsetValue, 1)).toISOString().substring(0, 7);
				} else {
					return new Date(Date.UTC(base.getFullYear(), base.getMonth() + offsetValue, 1)).toISOString().substring(0, 10);
				}
			} else {
				return new Date(Date.UTC(base.getFullYear(), base.getMonth() + offsetValue, base.getDate())).toISOString().substring(0, 10);
			}
		}

		else if(offset.unit == 'year') {

			if(offset.snap) {

				if(offset.filterType == 'year') {
					return new Date(Date.UTC(base.getFullYear() + offsetValue, 0, 1)).toISOString().substring(0, 4);
				} else {
					return new Date(Date.UTC(base.getFullYear() + offsetValue, 0, 1)).toISOString().substring(0, 10);
				}
			} else {
				return new Date(Date.UTC(base.getFullYear() + offsetValue, base.getMonth(), base.getDate())).toISOString().substring(0, 10);
			}
		}
	}

	changed({state} = {}) {

		if(!this.labelContainer) {
			return;
		}

		this.labelContainer.classList.remove('submitted');

		if(state == 'clear') {
			this.labelContainer.classList.remove('changed');
		}

		if(state == 'changed' && (!('submittedValue' in this) || JSON.stringify(this.submittedValue) != JSON.stringify(this.value))) {
			this.labelContainer.classList.add('changed');
		}

		if(state == 'submitted') {
			this.labelContainer.classList.add('submitted');
		}
	}
}

class DataSourceRow extends Map {

	constructor(row, source) {

		super();

		for(const key in row) {
			this.set(key, row[key]);
		}

		this.source = source;

		if(!row) {
			this.annotations = new Set();
			return;
		}

		this.clear();

		const
			columnsList = this.source.columns.list,
			columnKeys = [...columnsList.keys()];

		for(const [key, column] of columnsList) {

			if(column.formula) {

				let formula = column.formula;

				for(const column of columnsList.values()) {

					if(!formula.includes(column.key)) {
						continue;
					}

					let value = parseFloat(row[column.key]);

					if(isNaN(value)){
						value = `'${row[column.key]}'` || '';
					}

					formula = formula.replace(new RegExp(column.key, 'gi'), value);
				}

				try {

					row[key] = eval(formula);

					if(!isNaN(parseFloat(row[key]))) {
						row[key] = parseFloat(row[key]);
					}

				} catch(e) {
					row[key] = null;
				}
			}

			this.set(key, row[key]);
		}

		// Sort the row by position of their columns in the source's columns map
		const values = [...this.entries()].sort((a, b) => columnKeys.indexOf(a[0]) - columnKeys.indexOf(b[0]));

		this.clear();

		for(const [key, value] of values) {
			this.set(key, value);
		}

		this.annotations = new Set();
	}

	/**
	 * Get a user presentable value for a column in report.
	 * We need a separate way to get this value because applying type information in a graph usually breaks the graphs.
	 * So this value will only be used when showing the value to the user on screen and not to calculate the data.
	 *
	 * This will do things like
	 * - Apply prefix/postfix.
	 * - Apply date/number type formating.
	 *
	 * @param  string	key		The key whose value is needed.
	 * @param  string	value	An optional value, can be used to format this value with given key's settings.
	 * @return string			The value of the column with it's type information applied to it.
	 */
	getTypedValue(key, value = null) {

		if(!this.has(key)) {
			return undefined;
		}

		if(!this.source.columns.has(key)) {
			return undefined;
		}

		const column = this.source.columns.get(key);

		if(!value) {
			value = this.get(key);
		}

		if(column.type) {

			if(DataSourceColumn.formatType.has(column.type.name)) {
				value = Format.customTime(value, DataSourceColumn.formatType.get(column.type.name));
			}

			if(column.type.name == 'custom') {
				value = Format.customTime(value, column.type.format);
			}

			else if(column.type.name == 'customNumber') {
				value = Format.number(value, column.type.formatNumber);
			}

			else if(column.type.name == 'timeelapsed') {
				value = Format.ago(value);
			}

			else if(column.type.name == 'number') {
				value = Format.number(value);
			}

			else if(column.type.name == 'si') {
				value = d3.format(".3s")(value);
			}
		}

		if(column.prefix) {
			value = column.prefix + value;
		}

		if(column.postfix) {
			value = value + column.postfix;
		}

		return value;
	}
}

class DataSourceColumns extends Map {

	constructor(source) {

		super();

		this.source = source;
	}

	update(response) {

		if(!this.source.originalResponse || !this.source.originalResponse.data || !this.source.originalResponse.data.length) {
			return;
		}

		this.clear();

		for(const column in response && response.length ? response[0] : this.source.originalResponse.data[0]) {
			this.set(column, new DataSourceColumn(column, this.source));
		}
	}

	render() {

		const container = this.source.container.querySelector('.columns');

		container.textContent = null;

		for(const column of this.values()) {

			if(!column.hidden) {
				container.appendChild(column.container);
			}
		}

		if(!this.size) {
			container.innerHTML = '&nbsp;';
		}

		if(this.source.visualizations.selected && this.source.visualizations.selected.options && this.source.visualizations.selected.options.hideHeader) {
			this.source.container.querySelector('header').classList.add('hidden');
		}

		if(this.source.visualizations.selected && this.source.visualizations.selected.options && this.source.visualizations.selected.options.hideLegend) {
			this.source.container.querySelector('.columns').classList.add('hidden');
		}

		this.overFlow();
	}

	get list() {

		const result = new Map;

		for(const [key, column] of this) {

			if(!column.disabled) {
				result.set(key, column);
			}
		}

		return result;
	}

	overFlow() {

		const container = this.source.container.querySelector('.columns');

		container.classList.toggle('over-flow', container.offsetWidth < container.scrollWidth);
	}
}

class DataSourceColumn {

	constructor(column, source) {

		DataSourceColumn.colors = [
			'#3e7adc',
			'#ef6692',
			'#d6bcc0',
			'#ffca05',
			'#8dd593',
			'#ff8b75',
			'#2a0f54',
			'#d33f6a',
			'#f0b98d',
			'#6c54b5',
			'#bb7784',
			'#b5bbe3',
			'#0c8765',
			'#ef9708',
			'#1abb9c',
			'#9da19c',
		];

		this.key = column;
		this.source = source;
		this.name = this.key.split('_').filter(w => w.trim()).map(w => w.trim()[0].toUpperCase() + w.trim().slice(1)).join(' ');
		this.disabled = false;
		this.color = DataSourceColumn.colors[this.source.columns.size % DataSourceColumn.colors.length];

		if(this.source.format && this.source.format.columns) {

			const [format] = this.source.format.columns.filter(column => column.key == this.key);

			for(const key in format || {}) {
				this[key] = format[key];
			}
		}

		this.columnFilters = new DataSourceColumnFilters(this);
		this.columnAccumulations = new DataSourceColumnAccumulations(this);

		if(typeof this.type == 'string') {
			this.type = {
				name: this.type,
				format: '',
			};
		}

		if(this.disabled) {
			this.container.classList.add('disabled');
		}

		if(!isNaN(this.sort) && this.sort != -1) {
			this.source.columns.sortBy = this;
		}

		this.customDateType = new DataSourceColumnCustomDateType();
		this.customNumberType = new DataSourceColumnCustomNumberType();
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('column');

		container.innerHTML = `
			<span class="label">
				<span class="color" style="background: ${this.color}"></span>
				<span class="name">${this.name}</span>
			</span>
		`;

		const edit = document.createElement('a');

		edit.classList.add('edit-column');
		edit.title = 'Edit Column';
		edit.on('click', e => {

			e.stopPropagation();

			this.form.classList.remove('compact');
			this.edit();
		});

		edit.innerHTML = `&#8285;`;

		this.container.querySelector('.label').appendChild(edit);

		let timeout;

		container.querySelector('.label').on('click', async () => {

			clearTimeout(timeout);

			timeout = setTimeout(async () => {

				let found = false;

				if(!this.source.format) {
					this.source.format = {};
				}

				if (this.source.format.columns) {

					for (const column of this.source.format.columns) {

						if (column.key == this.key) {

							column.disabled = !column.disabled;
							found = true;
							break;
						}
					}
				}

				if (!found) {
					if (!this.source.format.columns) {
						this.source.format.columns = [];
					}

					this.source.format.columns.push({
						key: this.key,
						disabled: true,
					});
				}

				this.disabled = !this.disabled;
				await this.update();
			}, 300);
		});

		container.querySelector('.label').on('dblclick', async (e) => {

			clearTimeout(timeout);

			if(this.clicked == null) {
				this.clicked = true;
			}

			const columns = Array.from(this.source.columns.values());

			for(const column of columns) {

				if(column.key == this.key || (this.source.visualizations.selected.axes && column.key == this.source.visualizations.selected.axes.bottom.column)) {
					continue;
				}

				column.clicked = null;
				column.disabled = this.clicked;
				column.source.columns.render();
				await column.update();
			}

			this.clicked = !this.clicked;
			this.disabled = false;

			this.source.columns.render();

			await this.update();
		});

		this.setDragAndDrop();

		return container;
	}

	edit() {

		this.dialogueBox.body.appendChild(this.form);

		for(const key in this) {

			if(!(key in this.form)) {
				continue;
			}

			if(this.form[key].type == 'checkbox') {
				this.form[key].checked = this[key];
			}
			else {
				this.form[key].value = this[key];
			}
		}

		if(this.drilldown && this.drilldown.query_id) {
			this.drilldownQuery.value = this.drilldown && this.drilldown.query_id ? [this.drilldown.query_id] : [];
		}

		else {
			this.drilldownQuery.clear();
		}

		this.form.disabled.checked = this.disabled;

		if(!this.type) {
			return this.dialogueBox.show();
		}

		this.form.type.value = this.type.name;

		const format = DataSourceColumn.formatType.get(this.type.name) || {};

		if(this.form.querySelector('.timing-type-custom')) {
			this.form.querySelector('.timing-type-custom').remove();
		}

		this.customNumberType.container.remove();

		this.customDateType.value = format;

		if(this.type.name == 'custom') {

			this.form.insertBefore(this.customDateType.container, this.form.querySelector('label.color'));

			this.customDateType.value = this.type.format;
		}

		else if(this.type.name == 'customNumber') {

			this.form.insertBefore(this.customNumberType.container, this.form.querySelector('label.color'));

			this.customNumberType.value = this.type.formatNumber;
		}

		this.dialogueBox.show();
	}

	get form() {

		if(this.formContainer) {
			return this.formContainer;
		}

		const form = this.formContainer = document.createElement('form');

		form.classList.add('block', 'form', 'column-form');

		form.innerHTML = `
			<label>
				<span>Key</span>
				<input type="text" name="key" value="${this.key}" disabled readonly>
			</label>

			<label>
				<span>Name</span>
				<input type="text" name="name" value="${this.name}" >
			</label>

			<label class="columnType">
				<span>Type</span>
				<select name="type">
					<option value="string">String</option>
					<optgroup label="Numerical">
						<option value="number">Number</option>
						<option value="si">SI</option>
						<option value="customNumber">Custom</option>
					</optgroup>
					<optgroup label="Timing">
						<option value="date">Date</option>
						<option value="month">Month</option>
						<option value="year">Year</option>
						<option value="time">Time</option>
						<option value="datetime">Date Time</option>
						<option value="custom">Custom</option>
					</optgroup>
					<option value="timeelapsed">Time Elapsed</option>
					<option value="html">HTML</option>
					<option value="json">JSON</option>
				</select>
			</label>

			<label class="color">
				<span>Color</span>
				<input type="color" name="color" class="color">
			</label>

			<label>
				<span>Sort</span>
				<select name="sort">
					<option value="-1">None</option>
					<option value="0">Descending</option>
					<option value="1">Ascending</option>
				</select>
			</label>

			<label>
				<span>Prefix</span>
				<input type="text" name="prefix">
			</label>

			<label>
				<span>Postfix</span>
				<input type="text" name="postfix">
			</label>

			<label class="disable-column">
				<span><input type="checkbox" name="disabled"> <span>Disabled</span></span>
			</label>

			<label>
				<span>Collapse To</span>
				<select name="collapseTo">
					<option value="">None</option>
					<option value="second">Second</option>
					<option value="minute">Minute</option>
					<option value="hour">Hour</option>
					<option value="date">Date</option>
					<option value="week">Week</option>
					<option value="month">Month</option>
				</select>
			</label>

			<h3>Drill down</h3>

			<label class="drilldown-dropdown">
				<span>Destination Report</span>
			</label>

			<footer class="show">

				<button type="button" class="cancel">
					<i class="far fa-times-circle"></i> Cancel
				</button>

				<button type="submit" class="apply">
					<i class="fas fa-check"></i> Apply
				</button>

				<button type="button" class="save">
					<i class="far fa-save"></i> Save
				</button>
			</footer>
		`;

		if(!this.source.editable) {

			const saveData = form.querySelector('footer .save');

			saveData.disabled = true;
			saveData.dataset.tooltip = 'Insufficient Privileges';
			saveData.dataset.tooltipPosition = 'left';
		}

		form.type.on('change', () => {

			let
				typeFormat,
				selectedFormat;

			if(form.querySelector('.timing-type-custom')) {
				form.querySelector('.timing-type-custom').remove();
			}

			this.customNumberType.container.remove();

			if(DataSourceColumn.formatType.has(form.type.value)) {

				typeFormat = DataSourceColumn.formatType.get(form.type.value);

				selectedFormat = typeFormat;
			}

			else if(form.type.value == 'custom') {

				selectedFormat = this.customDateType.value;

				form.insertBefore(this.customDateType.container, form.querySelector('label.color'));

				this.customDateType.render(selectedFormat);
			}

			else if(form.type.value == 'customNumber') {

				form.insertBefore(this.customNumberType.container, form.querySelector('label.color'));
			}

			if(selectedFormat && form.type.value == 'custom') {
				this.customDateType.value = selectedFormat;
			}
		});

		form.on('submit', async e => this.apply(e));
		form.on('click', async e => e.stopPropagation());

		form.insertBefore(this.columnFilters.container, form.querySelector('.columnType'));
		form.insertBefore(this.columnAccumulations.container, form.querySelector('.columnType'));

		form.querySelector('.cancel').on('click', () => {

			this.dialogueBox.hide();

			if(!form.parentElement.classList.contains('body'))
				form.parentElement.classList.add('hidden');
		});

		if(this.source.editable) {

			form.querySelector('.save').on('click', () => {

				if(form.checkValidity())
					this.save();
			});
		}

		return form;
	}

	get dialogueBox() {

		if(this.dialogueBoxObject) {
			return this.dialogueBoxObject;
		}

		const dialogue = this.dialogueBoxObject = new DialogBox();

		dialogue.container.classList.add('data-source-column');
		dialogue.heading = 'Column Properties';

		const sortedReports = Array.from(DataSource.list.values()).sort((a, b) => {

			const
				nameA = a.name.toUpperCase(),
				nameB = b.name.toUpperCase();

			if(nameA < nameB) {
				return -1;
			}

			if(nameA > nameB) {
				return 1;
			}

			return 0;
		});

		const list = [];

		for(const report of sortedReports) {
			list.push({name: report.name, value: report.query_id});
		}

		this.drilldownQuery = new MultiSelect({datalist: list, multiple: false, mode: 'stretch'});

		this.form.querySelector('.drilldown-dropdown').appendChild(this.drilldownQuery.container);


		this.drilldownParameters = new DataSourceColumnDrilldownParameters(this);

		this.form.insertBefore(this.drilldownParameters.container, this.form.querySelector('.drilldown-dropdown').nextElementSibling);

		this.drilldownQuery.on('change', () => {

			if(this.drilldownQuery.value.length && parseInt(this.drilldownQuery.value[0]) != this.drilldown.query_id) {
				this.drilldownParameters.clear();
			}

			this.drilldownParameters.load()
		});

		dialogue.body.appendChild(this.form);

		return dialogue;
	}

	async apply(e) {

		if(e) {
			e.preventDefault();
		}

		if(!this.source.format) {
			this.source.format = {};
		}

		if(!this.source.format.columns) {
			this.source.format.columns = [];
		}

		const [sourceColumn] = this.source.format && this.source.format.columns ? this.source.format.columns.filter(c => c.key == this.key) : [];

		try {

			let customNumber;

			if(this.form.type.value == 'customNumber') {
				customNumber = this.customNumberType.value;
			}

			for(const element of this.form.elements) {

				if(element.name == 'type') {
					continue;
				}

				if(element.type == 'checkbox') {
					this[element.name] = element.checked;
				}

				else {

					this[element.name] = element.value == '' ? null : element.value || null;

					if(sourceColumn) {
						sourceColumn[element.name] = element.value == '' ? null : element.value || null;
					}
				}
			}

			this.filters = this.columnFilters.json;

			this.type = {
				name: this.form.type.value,
			};

			if(this.form.type.value == 'custom') {
				this.type.format = this.customDateType.value;
			}

			else if(this.form.type.value == 'customNumber') {
				this.type.formatNumber = customNumber;
			}
		}

		catch(e) {

			new SnackBar({
				message: 'Apply Failed',
				subtitle: e,
				type: 'error',
			});

			throw e;
		}

		if(this.interval) {
			clearInterval(this.interval);
		}

		const response = {
			key : this.key,
			name : this.name,
			type : this.type,
			disabled : this.disabled,
			color : this.color,
			searchType : this.searchType,
			filters : this.filters,
			sort : this.sort,
			prefix : this.prefix,
			postfix : this.postfix,
			collapseTo : this.collapseTo,
			drilldown : {
				query_id : parseInt(this.drilldownQuery.value[0]) || 0,
				parameters : this.drilldownParameters.json
			}
		};

		let updated = false;

		for(const [i, column] of this.source.format.columns.entries()) {

			if(column.key == this.key) {
				this.source.format.columns[i] = response;
				updated = true;
				break;
			}
		}

		if(!updated) {
			this.source.format.columns.push(response);
		}

		if(!this.form.parentElement.classList.contains('body')) {
			this.form.parentElement.classList.add('hidden');
		}

		if((this.source.columns.sortBy == this && this.sort == -1) || (this.sort != -1)) {
			this.source.columns.sortBy = this.sort == -1 ? null : this;
		}

		this.source.postProcessors.update();
		await this.source.visualizations.selected.render();

		this.dialogueBox.hide();
		this.source.columns.render();

		await this.update();

		new SnackBar({
			message: `Changes to <em>${this.name}</em> Applied`,
			subtitle: 'Changes are not saved yet and will be reset when the page reloads.',
		});
	}

	async save() {

		if(!this.source.format) {
			this.source.format = {};
		}

		if(!this.source.format.columns) {
			this.source.format.columns = [];
		}

		let
			response,
			updated = false;

		try {

			let customNumber;

			if(this.form.type.value == 'customNumber') {
				customNumber = this.customNumberType.value;
			}

			for(const element of this.form.elements) {

				if(element.name == 'type') {
					continue;
				}

				if(element.type == 'checkbox') {
					this[element.name] = element.checked;
				}

				else {
					this[element.name] = isNaN(element.value) ? element.value || null : element.value == '' ? null : parseFloat(element.value);
				}
			}

			this.filters = this.columnFilters.json;

			this.type = {
				name: this.form.type.value,
			};

			if(this.form.type.value == 'custom') {
				this.type.format = this.customDateType.value;
			}

			else if(this.form.type.value == 'customNumber') {
				this.type.formatNumber = customNumber;
			}
		}

		catch(e){

			new SnackBar({
				message: 'Save Failed',
				subtitle: e,
				type: 'error',
			});

			throw e;
		}

		if(this.interval) {
			clearInterval(this.interval);
		}

		response = {
			key : this.key,
			name : this.name,
			type : this.type,
			disabled : this.disabled,
			color : this.color,
			searchType : this.searchType,
			filters : this.filters,
			sort : this.sort,
			prefix : this.prefix,
			postfix : this.postfix,
			collapseTo : this.collapseTo,
			drilldown : {
				query_id : parseInt(this.drilldownQuery.value[0]) || 0,
				parameters : this.drilldownParameters.json
			}
		};

		for(const [i, column] of this.source.format.columns.entries()) {

			if(column.key == this.key) {
				this.source.format.columns[i] = response;
				updated = true;
				break;
			}
		}

		if((this.source.columns.sortBy == this && this.sort == -1) || (this.sort != -1)) {
			this.source.columns.sortBy = this.sort == -1 ? null : this;
		}

		if(!updated) {
			this.source.format.columns.push(response);
		}

		const
			parameters = {
				query_id : this.source.query_id,
				format : JSON.stringify(this.source.format),
			},
			options = {
				method: 'POST',
			};

		try {

			await API.call('reports/report/update', parameters, options);

			await this.source.visualizations.selected.load();

			this.dialogueBox.hide();

			new SnackBar({
				message: `Changes to <em>${this.name}</em> Saved`,
				subtitle: 'These changes will persist across page reloads.',
			});

		} catch(e) {

			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message,
				type: 'error',
			});
		}
	}

	async update() {

		this.render();

		this.source.columns.render();
		await this.source.visualizations.selected.render();
	}

	render() {

		this.container.classList.toggle('hidden', this.hidden ? true : false);

		this.container.querySelector('.label .name').textContent = this.name;

		this.container.classList.toggle('disabled', this.disabled);
		this.container.classList.toggle('filtered', this.filtered ? true : false);
	}

	validateFormula() {

		let formula = this.form.elements.formula.value;

		for(const column of this.source.columns.values()) {

			if(formula.includes(column.key)) {
				formula = formula.replace(new RegExp(column.key, 'gi'), 1);
			}
		}

		try {
			eval(formula);
		}

		catch(e) {

			this.form.elements.formula.classList.add('error');
			this.form.elements.formula.parentElement.querySelector('small').textContent = e.message;

			return;
		}

		this.form.elements.formula.classList.remove('error');
		this.form.elements.formula.parentElement.querySelector('small').innerHTML = '&nbsp;';
	}

	setDragAndDrop() {

		const container = this.container;

		container.setAttribute('draggable', 'true');

		container.on('dragstart', e => {
			this.source.columns.beingDragged = this;
			e.effectAllowed = 'move';
			container.classList.add('being-dragged');
			this.source.container.querySelector('.columns').classList.add('being-dragged');
		});

		container.on('dragend', () => {
			container.classList.remove('being-dragged');
			this.source.container.querySelector('.columns').classList.remove('being-dragged');
		});

		container.on('dragenter', e => {
			container.classList.add('drag-enter');
		});

		container.on('dragleave', () =>  {
			container.classList.remove('drag-enter');
		});

		// To make the targate droppable
		container.on('dragover', e => e.preventDefault());

		container.on('drop', e => {

			container.classList.remove('drag-enter');

			if(this.source.columns.beingDragged == this) {
				return;
			}

			this.source.columns.delete(this.source.columns.beingDragged.key);

			const columns = [...this.source.columns.values()];

			this.source.columns.clear();

			for(const column of columns) {

				if(column == this) {
					this.source.columns.set(this.source.columns.beingDragged.key, this.source.columns.beingDragged);
				}

				this.source.columns.set(column.key, column);
			}

			this.source.visualizations.selected.render();
			this.source.columns.render();
		});
	}

	async initiateDrilldown(row) {

		if(!this.drilldown || !parseInt(this.drilldown.query_id) || !this.drilldown.parameters) {
			return;
		}

		let destination = DataSource.list.get(parseInt(this.drilldown.query_id));

		if(!destination) {
			return;
		}

		destination = new DataSource(destination);

		await Promise.all(Array.from(destination.filters.values()).map(f => f.fetch()));

		for(const parameter of this.drilldown.parameters) {

			if(!destination.filters.has(parameter.placeholder)) {
				continue;
			}

			const filter = destination.filters.get(parameter.placeholder);

			let value;

			if(parameter.type == 'column') {
				value = row.get(parameter.value);
			}

			else if(parameter.type == 'filter') {
				value = this.source.filters.get(parameter.value).value;
			}

			else if(parameter.type == 'static') {
				value = parameter.value;
			}

			filter.value = value;
			parameter.selectedValue = value;
		}

		destination.drilldown = Object.assign({}, this.drilldown);
		destination.drilldown.parent = this.source;

		destination.container.setAttribute('style', this.source.container.getAttribute('style'));

		const parent = this.source.container.parentElement;

		parent.removeChild(this.source.container);
		parent.appendChild(destination.container);

		destination.container.querySelector('.drilldown').classList.remove('hidden');

		destination.visualizations.selected.load();
	}
}

class DataSourceColumnCustomDateType {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');
		container.classList.add('timing-type-custom');

		container.innerHTML = `

			<div class="timing-format">

				<fieldset>

					<legend>Weekday</legend>

					<label>
						<input type="radio" name="weekday" value="narrow">
						<span>W</span>
					</label>

					<label>
						<input type="radio" name="weekday" value="short">
						<span>WWW</span>
					</label>

					<label>
						<input type="radio" name="weekday" value="long">
						<span>WWWW</span>
					</label>
				</fieldset>

				<fieldset>

					<legend>Day</legend>

					<label>
						<input type="radio" name="day" value="numeric">
						<span>D</span>
					</label>

					<label>
						<input type="radio" name="day" value="2-digit">
						<span>DD</span>
					</label>
				</fieldset>

				<fieldset>

					<legend>Month</legend>

					<label>
						<input type="radio" name="month" value="numeric">
						<span>1</span>
					</label>

					<label>
						<input type="radio" name="month" value="2-digit">
						<span>01</span>
					</label>

					<label>
						<input type="radio" name="month" value="narrow">
						<span>M</span>
					</label>

					<label>
						<input type="radio" name="month" value="short">
						<span>MMM</span>
					</label>

					<label>
						<input type="radio" name="month" value="long">
						<span>MMMM</span>
					</label>
				</fieldset>

				<fieldset>

					<legend>Year</legend>

					<label>
						<input type="radio" name="year" value="2-digit">
						<span>YY</span>
					</label>

					<label>
						<input type="radio" name="year" value="numeric">
						<span>YYYY</span>
					</label>
				</fieldset>

				<fieldset>

					<legend>Hour</legend>

					<label>
						<input type="radio" name="hour" value="numeric">
						<span>H</span>
					</label>

					<label>
						<input type="radio" name="hour" value="2-digit">
						<span>HH</span>
					</label>
				</fieldset>

				<fieldset>

					<legend>Minute</legend>

					<label>
						<input type="radio" name="minute" value="numeric">
						<span>M</span>
					</label>

					<label>
						<input type="radio" name="minute" value="2-digit">
						<span>MM</span>
					</label>
				</fieldset>

				<fieldset>

					<legend>Second</legend>

					<label>
						<input type="radio" name="second" value="numeric">
						<span>S</span>
					</label>

					<label>
						<input type="radio" name="second" value="2-digit">
						<span>SS</span>
					</label>
				</fieldset>
			</div>

			<span class="example"></span>
		`;

		const resultDate = container.querySelector('.example');

		for(const radio of container.querySelectorAll('input[type="radio"]')) {

			radio.on('click', () => {

				for(const [index, _radio] of this.checkedradio.entries()) {

					if(_radio.name == radio.name) {

						if(_radio.value == radio.value) {
							radio.checked = false;
						}

						this.checkedradio.splice(index, 1);
					}
				}

				if(radio.checked) {
					this.checkedradio.push(radio);
				}

				this.render(this.value);
			})
		}

		return container;
	}

	set value(format) {

		if(!this.containerElement) {
			return this.customValueCache = format;
		}

		for(const radio of this.container.querySelectorAll('input[type=radio]')) {
			radio.checked = (format[radio.name] == radio.value);
		}

		this.render(format);

		this.checkedradio = [];

		for(const radio of this.container.querySelectorAll('input[type="radio"]')) {

			if(radio.checked) {
				this.checkedradio.push(radio);
			}
		}
	}

	get value() {

		if(!this.containerElement) {
			return this.customValueCache;
		}

		const
			formats = ['weekday', 'day', 'month', 'year', 'hour', 'minute', 'second'],
			checkedradio = {};

		for(const format of formats) {

			const input = this.container.querySelector(`input[name=${format}]:checked`);

			if(input) {
				checkedradio[format] = input.value;
			}
		}

		return checkedradio;
	}

	render(format) {

		const example = this.container.querySelector('.example');

		if(!format) {
			return example.innerHTML = '<span class="NA">No Format Selected</span>';
		}

		example.innerHTML = '<span class="NA">Example:</span> ' + Format.customTime(Date.now(), format);

		if(this.interval) {
			clearInterval(this.interval);
		}

		this.interval = setInterval(() => {
			example.innerHTML = '<span class="NA">Example:</span> ' + Format.customTime(Date.now(), format);
		}, 1000);
	}
}

class DataSourceColumnCustomNumberType {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');
		container.classList.add('number-type-custom');

		container.innerHTML = `

			<span class="NA">Example: <span class="example"></span></span>

			<div class="number-format">

				<label>
					<span>Style</span>
					<select name="style">
						<option value="currency">Currency</option>
						<option value="percent">Percent</option>
						<option value="decimal" selected>Decimal</option>
					</select>
				</label>

				<label class="currency-display">
					<span>Currency Display</span>
					<select name="currencyDisplay">
						<option value="symbol" selected>Symbol</option>
						<option value="code">Code</option>
						<option value="name">Name</option>
					</select>
				</label>

				<label>
					<span>Use Grouping</span>
					<select name="useGrouping">
						<option value="true" selected>Yes</option>
						<option value="false">No</option>
					</select>
				</label>

				<label>
					<span>Round off</span>
					<select name="roundOff">
						<option value="none" selected>None</option>
						<option value="round">Round</option>
						<option value="ceil">Ceil</option>
						<option value="floor">Floor</option>
					</select>
				</label>

			</div>

			<div class="form">

				<label class="currency-symbol hidden">
					<span class="currency-code">
						Currency Code
						<a href="https://www.currency-iso.org/en/home/tables/table-a1.html" data-tooltip="Help" class="currency-list NA" target="_blank">
								<i class="fa fa-question" aria-hidden="true"></i>
						</a>
					</span>
					<input type="text" name="currency">
				</label>

				<label class="round-precision hidden">
					<span>Round Precision</span>
					<input type="number" name="roundPrecision" min="0" step="1" max="100">
				</label>

				<label>
					<span>Minimum Integer Digits</span>
					<input type="number" name="minimumIntegerDigits" min="1" step="1" max="21">
				</label>

				<label>
					<span>Minimum Fraction Digits</span>
					<input type="number" name="minimumFractionDigits" min="0" step="1" max="20">
				</label>

				<label>
					<span>Maximum Fraction Digits</span>
					<input type="number" name="maximumFractionDigits" min="0" step="1" max="20">
				</label>

				<label>
					<span>Minimum Significant Digits</span>
					<input type="number" name="minimumSignificantDigits" min="1" step="1" max="21">
				</label>

				<label>
					<span>Maximum Significant Digits</span>
					<input type="number" name="maximumSignificantDigits" min="1" step="1" max="21">
				</label>
			</div>
		`;

		for(const value of container.querySelectorAll('input')) {

			value.on('keyup', () => this.render());
			value.on('change', () => this.render());
		}

		for(const select of container.querySelectorAll('select')) {

			select.on('change', () => {

				container.querySelector('.currency-symbol').classList.toggle('hidden', select.value == 'percent' || select.value == 'decimal');
				container.querySelector('.currency-display').classList.toggle('hidden', select.value == 'percent' || select.value == 'decimal');

				this.render();
			});
		}

		this.render();

		return container;
	}

	set value(format) {

		if(!this.containerElement) {
			return this.customNumberValueCache = format;
		}

		const selector = this.container.querySelectorAll('input, select');

		for(const element of selector) {
			element.value = null;
		}

		for(const element of selector) {

			if(element.name in format) {
				element.value = format[element.name];
			}
		}

		this.render();
	}

	get value() {

		if(!this.containerElement) {
			return this.customNumberValueCache;
		}

		const selectedInputs = {};

		for(const element of this.container.querySelectorAll('select, input')) {

			if(element.name == 'useGrouping') {
				selectedInputs[element.name] = JSON.parse(element.value);
			}

			else if(element.value) {
				selectedInputs[element.name] = element.value;
			}
		}

		selectedInputs.locale = 'en';

		new Intl.NumberFormat(undefined, selectedInputs);

		return selectedInputs;
	}

	render() {

		const example = this.container.querySelector('.example');

		try {

			const
				format = this.value,
				number = 123456.789;

			if(!this.currencySymbol) {
				this.currencySymbol = this.container.querySelector('.currency-symbol');
			}

			if(!this.currencyDisplay) {
				this.currencyDisplay = this.container.querySelector('.currency-display');
			}

			if(!this.roundPrecision) {
				this.roundPrecision = this.container.querySelector('.round-precision');
			}

			this.currencySymbol.classList.toggle('hidden', format.style != 'currency');
			this.currencyDisplay.classList.toggle('hidden', format.style != 'currency');
			this.roundPrecision.classList.toggle('hidden', format.roundOff != 'round');

			new Intl.NumberFormat(undefined, format);

			example.classList.remove('example-error');

			return example.innerHTML = Format.number(number, format);
		}

		catch(e) {

			example.classList.add('example-error');
			example.innerHTML = e;

			return;
		}
	}
}

DataSourceColumn.formatType = new Map;

DataSourceColumn.formatType.set('date',
	{
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	}
);

DataSourceColumn.formatType.set('month',
	{
		year: 'numeric',
		month: 'short',
		timeZone: 'UTC',
	}
);

DataSourceColumn.formatType.set('year',
	{
		year: 'numeric',
		timeZone: 'UTC',
	}
);

DataSourceColumn.formatType.set('datetime',
	{
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric'
	}
);

DataSourceColumn.formatType.set('time',
	{
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric',
	}
);

class DataSourceColumnDrilldownParameters extends Set {

	constructor(column) {

		super();

		this.column = column;

		this.column.drilldown = this.column.drilldown || {};

		for(const paramter of this.column.drilldown.parameters || []) {

			this.add(new DataSourceColumnDrilldownParameter(paramter, this));
		}
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('drilldown-parameters');

		container.innerHTML = `
			<label>
				<span>Parameters</span>
				<button type="button" class="add-parameters"><i class="fa fa-plus"></i> Add New</button>
			</label>
			<div class="parameter-list"></div>
		`;

		container.querySelector('.add-parameters').on('click', () => {

			this.add(new DataSourceColumnDrilldownParameter({}, this));
			this.load();
		});

		this.load();

		return container;
	}

	load() {

		const
			parameterList = this.container.querySelector('.parameter-list'),
			report = DataSource.list.get(parseInt(this.column.drilldownQuery.value[0]));

		parameterList.textContent = null;

		if(!this.size) {

			parameterList.innerHTML = '<div class="NA">No parameters added.</div>';
		}
		else {

			for(const paramter of this.values()) {
				parameterList.appendChild(paramter.container);
			}
		}

		this.container.querySelector('.add-parameters').parentElement.classList.toggle('hidden', !report || !report.filters.length);
		this.update();

	}

	update(updatingType) {

		const
			parameterList = this.container.querySelector('.parameter-list'),
			report = DataSource.list.get(parseInt(this.column.drilldownQuery.value[0]));

		if(report && report.filters.length) {

			for(const parameter of this.values()) {

				parameter.update(updatingType);
			}
		}
		else {

			parameterList.innerHTML = '<div class="NA">No filters present in the selected report.</div>';
		}
	}

	get json() {

		const json = [];

		for(const parameter of this.values()) {

			json.push(parameter.json)

		}

		return json;
	}
}

class DataSourceColumnDrilldownParameter {

	constructor(parameter, columnDrillDown) {

		Object.assign(this, parameter);

		this.columnDrilldown = columnDrillDown;
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.innerHTML = `

			<label>
				<span>Destination Filter</span>
				<select name="placeholder" value="${this.placeholder || ''}"></select>
			</label>

			<label>
				<span>Source Type</span>
				<select name="type" value="${this.type || ''}">
					<option value="column">Column</option>
					<option value="filter">Filter</option>
					<option value="static">Custom</option>
				</select>
			</label>

			<label>
				<span>Source Value</span>
				<select name="value" value="${this.value || ''}"></select>
				<input name="value" value="${this.value || ''}" class="hidden">
			</label>

			<label>
				<span>&nbsp;</span>
				<button type="button" class="delete">
					<i class="far fa-trash-alt"></i> Delete
				</button>
			</label>
		`;

		container.classList.add('parameter');

		container.querySelector('select[name=type]').on('change', () => this.update(true));

		container.querySelector('.delete').on('click', () => {
			this.columnDrilldown.delete(this);
			this.columnDrilldown.load();
		});

		return container;
	}

	update(updatingType) {

		const
			placeholder = this.container.querySelector('select[name=placeholder]'),
			type = this.container.querySelector('select[name=type]'),
			report = DataSource.list.get(parseInt(this.columnDrilldown.column.drilldownQuery.value[0]));

		let
			value = this.container.querySelector('select[name=value]'),
			placeholderValue = placeholder.value || placeholder.getAttribute('value');

		value.classList.remove('hidden');
		this.container.querySelector('input[name=value]').classList.add('hidden');


		placeholder.textContent = null;

		for(const filter of report.filters) {
			placeholder.insertAdjacentHTML('beforeend', `<option value="${filter.placeholder}">${filter.name}</option>`);
		}

		if(placeholderValue) {
			placeholder.value = placeholderValue;
		}

		if(!updatingType && type.getAttribute('value')) {
			type.value = type.getAttribute('value');
		}

		value.textContent = null;

		if(type.value == 'column') {

			for(const column of this.columnDrilldown.column.source.columns.list.values()) {
				value.insertAdjacentHTML('beforeend', `<option value="${column.key}">${column.name}</option>`);
			}
		}

		else if(type.value == 'filter') {

			for(const filter of this.columnDrilldown.column.source.filters.values()) {
				value.insertAdjacentHTML('beforeend', `<option value="${filter.placeholder}">${filter.name}</option>`);
			}
		}
		else {
			value.classList.add('hidden');
			value = this.container.querySelector('input[name=value]');
			value.classList.remove('hidden');
		}

		if(value.getAttribute('value')) {
			value.value = value.getAttribute('value');
		}
	}

	get json() {

		return {
			placeholder: this.container.querySelector('select[name=placeholder]').value,
			type: this.container.querySelector('select[name=type]').value,
			value: this.container.querySelector('select[name=value]').classList.contains('hidden') ? this.container.querySelector('input[name=value]').value : this.container.querySelector('select[name=value]').value
		}
	}
}

class DataSourceColumnFilters extends Set {

	constructor(column) {

		super();

		this.column = column;
		const filters = this.column.filters && this.column.filters.length ? this.column.filters : [{name: '0', value: ''}];

		for(const filter of filters) {
			this.add(new DataSourceColumnFilter(filter, this));
		}
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('show', 'filters');

		container.innerHTML = `
			<span>
				Search
				<button type="button" class="show add-filter add-new-item"><i class="fa fa-plus"></i></button>
			</span>
			<div class="list"></div>
		`;

		container.querySelector('button.add-filter').on('click', () => {

			this.add(new DataSourceColumnFilter({name: '0', value: ''}, this));
			this.render();
		});

		this.render();

		return container;
	}

	render() {

		const div = this.container.querySelector('.list');

		div.textContent = null;

		for(const filter of this) {
			div.appendChild(filter.container);
		}

		if(!this.size) {
			div.innerHTML = '<div class="NA">No Filters Added</div>'
		}
	}

	get json() {

		const json = [];

		for(const filter of this) {
			json.push(filter.json);
		}

		return json;
	}
}

class DataSourceColumnFilter {

	static setup() {

		DataSourceColumnFilter.types = [
			{
				slug: 'contains',
				name: 'Contains',
				apply: (q, v) => v.toString().toLowerCase().includes(q.toString().toLowerCase()),
			},
			{
				slug: 'notcontains',
				name: 'Not Contains',
				apply: (q, v) => !v.toString().toLowerCase().includes(q.toString().toLowerCase()),
			},
			{
				slug: 'startswith',
				name: 'Starts With',
				apply: (q, v) => v.toString().toLowerCase().startsWith(q.toString().toLowerCase()),
			},
			{
				slug: 'endswith',
				name: 'Ends With',
				apply: (q, v) => v.toString().toLowerCase().endsWith(q.toString().toLowerCase()),
			},
			{
				slug: 'empty',
				name: 'Is Empty',
				apply: (q, v) => ['', null].includes(v.toString().trim()),
			},
			{
				slug: 'notempty',
				name: 'Is Not Empty',
				apply: (q, v) => !['', null].includes(v.toString().trim()),
			},
			{
				slug: 'equalto',
				name: '=',
				apply: (q, v) => v.toString().toLowerCase() == q.toString().toLowerCase(),
			},
			{
				slug: 'notequalto',
				name: '!=',
				apply: (q, v) => v.toString().toLowerCase() != q.toString().toLowerCase(),
			},
			{
				slug: 'greaterthan',
				name: '>',
				apply: (q, v) => v > q,
			},
			{
				slug: 'lessthan',
				name: '<',
				apply: (q, v) => v < q,
			},
			{
				slug: 'greaterthanequalsto',
				name: '>=',
				apply: (q, v) => v >= q,
			},
			{
				slug: 'lessthanequalto',
				name: '<=',
				apply: (q, v) => v <= q,
			},
			{
				slug: 'regularexpression',
				name: 'RegExp',
				apply: (q, v) => v.toString().match(new RegExp(q, 'i')),
			},
		];
	}

	constructor(filter, filters) {

		Object.assign(this, filter);

		this.filters = filters;
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('label');

		container.classList.add('search-type');

		container.innerHTML = `
			<div class="category-group search">
				<select class="searchType"></select>
				<input type="search" class="searchQuery">
				<button type="button" class="delete"><i class="far fa-trash-alt"></i></button>
			</div>
		`;

		const
			searchType = container.querySelector('.searchType'),
			searchQuery = container.querySelector('.searchQuery');

		for(const filter of DataSourceColumnFilter.types) {

			searchType.insertAdjacentHTML('beforeend', `
				<option value="${filter.slug}">
					${filter.name}
				</option>
			`);
		}

		searchType.on('change', () => {

			const disabled = ['empty', 'notempty'].includes(searchType.value);

			searchQuery.disabled = disabled;

			if(disabled) {
				searchQuery.value = '';
			}
		});

		if(this.slug) {
			container.querySelector('.searchType').value = this.slug;
		}

		container.querySelector('.searchQuery').value = this.value;

		{
			const disabled = ['empty', 'notempty'].includes(searchType.value);

			searchQuery.disabled = disabled;

			if(disabled) {
				searchQuery.value = '';
			}
		}

		container.querySelector('.delete').on('click', () => {
			this.filters.delete(this);
			this.filters.render();
		});

		return container;
	}

	get json() {

		return {
			slug: this.container.querySelector('select').value,
			value: this.container.querySelector('input').value,
		};
	}
}

class DataSourceColumnAccumulations extends Set {

	constructor(column) {

		super();

		this.column = column;
		this.accumulations =[{name:'', value:''}];

		for(const accumulation of this.accumulations) {
			this.add(new DataSourceColumnAccumulation(accumulation, this));
		}
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('show', 'accumulations');

		container.innerHTML = `
			<span>
				Accumulation
				<button type="button" class="show add-accumulation add-new-item"><i class="fa fa-plus"></i></button>
			</span>
			<div class="list"></div>
		`;

		container.querySelector('button.add-accumulation').on('click', () => {

			this.add(new DataSourceColumnAccumulation({name:'', value:''}, this));
			this.render();
		});

		this.render();

		return container;
	}

	render() {

		const div = this.container.querySelector('.list');

		div.textContent = null;

		for(const accumulation of this) {
			div.appendChild(accumulation.container);
		}

		if(!this.size) {
			div.innerHTML = '<div class="NA">No Accumulation Added</div>'
		}
	}
}

class DataSourceColumnAccumulation {

	static setup() {

		DataSourceColumnAccumulation.accumulationTypes = [
			{
				slug: 'sum',
				name: 'Sum',
				apply: (rows, column) => Format.number(rows.reduce((c, r) => c + (parseFloat(r.get(column)) || 0), 0)),
			},
			{
				slug: 'average',
				name: 'Average',
				apply: (rows, column) => Format.number(rows.reduce((c, r) => c + (parseFloat(r.get(column)) || 0), 0) / rows.length),
			},
			{
				slug: 'max',
				name: 'Max',
				apply: (rows, column) => Format.number(Math.max(...rows.map(r => parseFloat(r.get(column)) || 0))),
			},
			{
				slug: 'min',
				name: 'Min',
				apply: (rows, column) => Format.number(Math.min(...rows.map(r => parseFloat(r.get(column)) || 0))),
			},
			{
				slug: 'distinctcount',
				name: 'Distinct Count',
				apply: (rows, column) => Format.number(new Set(rows.map(r => r.get(column))).size),
				string: true,
			},
			{
				slug: 'distinctvalues',
				name: 'Distinct Values',
				apply: (rows, column) => Array.from(new Set(rows.map(r => r.get(column)))).join(', '),
				string: true,
			},
		];
	}

	constructor(accumulation, accumulations) {

		Object.assign(this, accumulation);

		this.accumulations = accumulations;
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('label');

		container.classList.add('accumulation-type');

		container.innerHTML = `
			<div class="category-group">
				<select class="accumulation-content"></select>
				<input type="text" readonly>
				<button type="button" class="delete"><i class="far fa-trash-alt"></i></button>
			</div>
		`;

		const select = container.querySelector('.accumulation-content');

		select.insertAdjacentHTML('beforeend', `<option value="-1">Select</option>`);

		for(const [i, type] of DataSourceColumnAccumulation.accumulationTypes.entries()) {
			select.insertAdjacentHTML('beforeend', `<option value="${i}">${type.name}</option>`);
		}

		select.querySelector('option').selected = true;

		if(select.value != '-1') {
			this.run();
		}

		select.on('change', () => this.run());

		container.querySelector('.delete').on('click', () => {

			this.accumulations.delete(this);
			this.accumulations.render();
		});

		return container
	}

	async run() {

		const select = this.container.querySelector('select');

		const accumulation = DataSourceColumnAccumulation.accumulationTypes[select.value];

		if(accumulation) {
			this.container.querySelector('input').value = accumulation.apply(await this.accumulations.column.source.response(), this.accumulations.column.key);
		}

		else this.container.querySelector('input').value = '';
	}
}

class DataSourcePostProcessors {

	constructor(source) {

		this.source = source;

		this.list = new Map;

		for(const [key, processor] of DataSourcePostProcessors.processors) {
			this.list.set(key, new processor(this.source, key));
		}

		if(source.postProcessor && this.list.has(source.postProcessor.name)) {
			this.selected = this.list.get(source.postProcessor.name);
		}
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const
			container = this.containerElement = document.createDocumentFragment(),
			processors = document.createElement('div');

		processors.classList.add('item');

		processors.classList.toggle('hidden', this.timingColumn ? false : true);

		processors.innerHTML =`
			<div class="label postprocessors">
				<i class="fas fa-wrench"></i>
				<div>Functions</div>
			</div>
			<div class="submenu"></div>
		`;

		const submenu = processors.querySelector('.submenu');

		for(const processor of this.list.values()) {
			submenu.appendChild(processor.container);
		}

		container.appendChild(processors);

		return container;
	}

	update() {

		this.timingColumn = this.source.columns.get('timing');

		for(const column of this.source.columns.values()) {
			if(column.type && ['datetime', 'date', 'week', 'year', 'custom'].includes(column.type.name)) {
				this.timingColumn = column;
			}
		}

		if(!this.selected && this.timingColumn && this.timingColumn.collapseTo) {

			this.selected = this.list.get('CollapseTo');
			this.selected.value = this.timingColumn.collapseTo;
		}

		const label = this.source.container.querySelector('.postprocessors');

		if(!label) {
			return;
		}

		label.parentElement.classList.toggle('hidden', this.timingColumn ? false : true);
	}

	render() {

		let container = this.source.container.querySelector('.postprocessors-state');

		if(!container) {

			container = document.createElement('div');

			container.classList.add('postprocessors-state');
			container.title = 'Click to Remove';

			container.on('click', () => {
				this.selected = null;
				this.source.visualizations.selected.render();
				this.render();
			});

			this.source.container.appendChild(container);
		}

		const label = this.source.container.querySelector('.postprocessors');

		if(!label) {
			return;
		}

		for(const selected of label.parentElement.querySelectorAll('.item.selected'))
			selected.classList.remove('selected');

		container.classList.toggle('hidden', !this.selected);

		if(!this.selected) {
			return this.list.get('Orignal').container.classList.add('selected');
		}

		container.innerHTML = `
			${this.selected.name}
			<i class="fas fa-angle-right"></i>
			${this.selected.domain.get(this.selected.value) || this.selected.value}
			<i class="fas fa-times-circle"></i>
		`;

		for(const item of this.selected.container.querySelectorAll('.submenu .item')) {
			item.classList.toggle('selected', this.selected.value == item.dataset.value);
		}

		this.selected.container.classList.add('selected');
	}
}

class DataSourcePostProcessor {

	constructor(source, key) {
		this.source = source;
		this.key = key;
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('item');

		container.innerHTML = `
			<div class="label">
				<span class="no-icon">${this.name}</span>
			</div>
			<div class="submenu"></div>
		`;

		if(this.key == 'Orignal') {

			container.querySelector('.label').on('click', () => {

				for(const column of this.source.columns.values()) {

					if(!column.type || !column.type.originalName) {
						continue;
					}

					column.type.name = column.type.originalName;
					delete column.type.originalName;
				}

				delete this.source.postProcessors.selected;

				this.source.visualizations.selected.render();
				this.source.postProcessors.render();
			});
		}

		const submenu = container.querySelector('.submenu');

		for(const [value, name] of this.domain) {

			const item = document.createElement('div');

			item.classList.add('item');

			item.innerHTML = `
				<div class="label">
					<div class="no-icon">${name}</div>
				</div>
			`;

			item.dataset.value = value;

			item.on('click', () => {

				this.source.postProcessors.selected = this;
				this.source.postProcessors.selected.value = value;

				for(const column of this.source.columns.values()) {

					if(!column.type || !column.type.originalName) {
						continue;
					}

					column.type.name = column.type.originalName;
				}

				this.source.visualizations.selected.render();
				this.source.postProcessors.render();
			});

			submenu.appendChild(item);
		}

		return container;
	}
}

class DataSourceTransformations extends Set {

	constructor(source) {

		super();

		this.source = source;
	}

	async run(response, implied) {

		this.clear();

		this.reset();

		if(!implied) {
			this.loadFilters();
			this.loadSorting();
		}

		response = JSON.parse(JSON.stringify(response));

		for(const transformation of this) {
			response = await transformation.run(response);
		}

		if(this.size) {
			this.source.columns.update(response);
			this.source.columns.render();
		}

		return response;
	}

	reset() {

		const
			visualization = this.source.visualizations.selected,
			transformations = visualization.options && visualization.options.transformations ? visualization.options.transformations : [];

		for(const [i, transformation] of transformations.entries()) {

			if(!DataSourceTransformation.types.has(transformation.type)) {
				continue;
			}

			const transformationType = new (DataSourceTransformation.types.get(transformation.type))(transformation, this.source);

			this.add(transformationType);

			if(i > visualization.options.transformationsStopAt) {
				transformationType.disabled = true;
			}
		}
	}

	loadFilters() {

		const filters = [];

		for(const column of this.source.columns.list.values()) {

			if(!column.filters || !column.filters.length) {
				continue;
			}

			for(const filter of column.filters) {

				filters.push({
					column: column.key,
					function: filter.slug,
					value: filter.value,
				});
			}
		}

		if(!filters.length) {
			return;
		}

		const type = DataSourceTransformation.types.get('filters');

		const options = {
			filters,
		};

		this.add(new type({type: 'filters', options, implied: true}, this.source));
	}

	loadSorting() {

		if(!this.source.columns.sortBy || this.source.columns.sortBy.sort == -1) {
			return;
		}

		const
			type = DataSourceTransformation.types.get('sort'),
			columns = [
				{
					column: this.source.columns.sortBy.key,
					order: parseInt(this.source.columns.sortBy.sort) == 1 ? 'ascending' : 'descending',
				}
			];

			const options = {
				columns,
			};

		this.add(new type({type: 'sort', options, implied: true}, this.source));
	}
}

class DataSourceTransformation {

	constructor(transformation, source) {

		this.source = source;

		Object.assign(this, transformation);

		this.incoming = {
			rows: null,
			columns: new DataSourceColumns(this.source),
		};

		this.outgoing = {
			rows: null,
			columns: new DataSourceColumns(this.source),
		};

		if(!this.options)
			this.options = {};
	}

	async run(response) {

		if(!response || !response.length) {
			return response;
		}

		const time = performance.now();

		this.incoming.rows = response.length || 0;
		this.incoming.columns.update(response);

		if(!this.disabled) {
			response = await this.execute(response);
		}

		this.outgoing.rows = response ? response.length : 0;
		this.outgoing.columns.update(response);

		this.executionDuration = performance.now() - time;

		this.source.pipeline.add(new DataSourcePipelineEvent({
			title: this.name,
			disabled: this.disabled,
			implied: this.implied,
			subtitle: [
				{
					key: 'Duration',
					value: `${Format.number(this.executionDuration)}ms`
				},
				{
					key: 'Rows',
					value: Format.number(this.outgoing.rows)
				},
				{
					key: 'Columns',
					value: Format.number(this.outgoing.columns.size)
				},
			],
		}));

		return response;
	}
}

DataSourceTransformation.types = new Map;

DataSourceTransformation.types.set('pivot', class DataSourceTransformationPivot extends DataSourceTransformation {

	get name() {
		return 'Pivot Table';
	}

	async execute(response = []) {

		if(!response || !response.length) {
			return response;
		}

		const
			[{column: groupColumn}] = this.options.columns && this.options.columns.length ? this.options.columns : [{}],
			columns = new Set,
			rows = new Map;

		if(groupColumn) {

			for(const row of response) {
				if(!columns.has(row[groupColumn])) {
					columns.add(row[groupColumn]);
				}
			}
		}

		for(const responseRow of response) {

			let key = {};

			for(const row of this.options.rows || []) {
				key[row.column] = responseRow[row.column];
			}

			key = JSON.stringify(key);

			if(!rows.get(key)) {
				rows.set(key, new Map);
			}

			const row = rows.get(key);

			if(groupColumn) {

				for(const column of columns) {

					if(!row.has(column)) {
						row.set(column, []);
					}

					if(responseRow[groupColumn] != column) {
						continue;
					}

					row.get(column).push(responseRow[this.options.values[0].column]);
				}
			} else {

				for(const value of this.options.values || []) {

					if(!(value.column in responseRow)) {
						continue;
					}

					if(!row.has(value.name || value.column)) {
						row.set(value.name || value.column, []);
					}

					row.get(value.name || value.column).push(responseRow[value.column])
				}
			}
		}

		const newResponse = [];

		for(const [key, row] of rows) {

			const
				newRow = {},
				keys = JSON.parse(key);

			for(const key in keys) {
				newRow[key] = keys[key];
			}

			for(const [groupColumnValue, values] of row) {

				let
					value = null,
					function_ = null;

				if(groupColumn)
					function_ = this.options.values[0].function;

				else {

					for(const value of this.options.values) {
						if((value.name || value.column) == groupColumnValue) {
							function_ = value.function;
						}
					}
				}

				switch(function_) {

					case 'sum':
						value = values.reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
						break;

					case 'count':
						value = values.length;
						break;

					case 'distinctcount':
						value = new Set(values).size;
						break;

					case 'max':
						value = Math.max(...values);
						break;

					case 'min':
						value = Math.min(...values);
						break;

					case 'average':
						value = Math.floor(values.reduce((sum, value) => sum + (parseFloat(value) || 0), 0) / values.length * 100) / 100;
						break;

					case 'values':
						value = values.join(', ');
						break;

					case 'distinctvalues':
						value = Array.from(new Set(values)).join(', ');
						break;

					default:
						value = values.length;
				}

				newRow[groupColumnValue] = value;
			}

			newResponse.push(newRow);
		}

		return newResponse;
	}
});

DataSourceTransformation.types.set('filters', class DataSourceTransformationFilters extends DataSourceTransformation {

	get name() {
		return 'Filters';
	}

	async execute(response = []) {

		if(!response || !response.length || !this.options.filters || !this.options.filters.length)
			return response;

		const newResponse = [];

		for(const row of response) {

			let status = true;

			for(const _filter of this.options.filters) {

				const [filter] = DataSourceColumnFilter.types.filter(f => f.slug == _filter.function);

				if(!filter) {
					continue;
				}

				if(!(_filter.column in row)) {
					continue;
				}

				const searchString = row[_filter.column] == null ? '' : row[_filter.column];

				if(!filter.apply(_filter.value, searchString)) {
					status = false;
				}
			}

			if(status)
				newResponse.push(row);
		}

		return newResponse;
	}
});

DataSourceTransformation.types.set('autofill', class DataSourceTransformationAutofill extends DataSourceTransformation {

	get name() {
		return 'Auto Fill';
	}

	async execute(response = []) {

		if(!response || !response.length)
			return response;

		let
			start = null,
			end = null;

		if(this.options.start_filter  && this.source.filters.has(this.options.start_filter) && this.options.end_filter && this.source.filters.has(this.options.end_filter)) {

			start = Date.parse(this.source.filters.get(this.options.start_filter).value);
			end = Date.parse(this.source.filters.get(this.options.end_filter).value);
		}

		else {

			for(const row of response) {

				if(!start || row[this.options.column] < start) {
					start = row[this.options.column];
				}

				if(!end || row[this.options.column] > end) {
					end = row[this.options.column];
				}
			}

			start = Date.parse(start);
			end = Date.parse(end);
		}

		if(!start || !end) {
			return response;
		}

		const
			newResponse = {},
			mappedResponse = {},
			granularity = {
				number: {
					step: d => parseFloat(d) + 1,
					output: d => d,
				},
				second: {
					step: d => d + (1000),
					output: d => new Date(d).toISOString().replace('T', ' '),
				},
				minute: {
					step: d => d + (60 * 1000),
					output: d => new Date(d).toISOString().replace('T', ' '),
				},
				hour: {
					step: d => d + (60 * 60 * 1000),
					output: d => new Date(d).toISOString().replace('T', ' '),
				},
				date: {
					step: d => d + (24 * 60 * 60 * 1000),
					output: d => new Date(d).toISOString().substring(0, 10),
				},
				month: {
					step: d => new Date(d).setMonth(d.getMonth + 1),
					output: d => new Date(d).toISOString().substring(0, 7),
				},
				year: {
					step: d => new Date(d).setYear(d.getYear + 1),
					output: d => new Date(d).toISOString().substring(0, 4),
				},
			};

		for(const row of response) {

			let key;

			if(this.options.granularity == 'number') {
				key = parseFloat(row[this.options.column]);
			}

			else {
				key = Date.parse(row[this.options.column]);
			}

			mappedResponse[key] = row;
		}

		while(start <= end) {

			newResponse[start] = {};

			if(start in mappedResponse) {
				newResponse[start] = mappedResponse[start];
			}

			else {

				for(const key in response[0]) {
					newResponse[start][key] = this.options.content;
				}

				newResponse[start][this.options.column] = granularity[this.options.granularity].output(start);
			}

			start = granularity[this.options.granularity].step(start);
		}

		return Object.values(newResponse);
	}
});

DataSourceTransformation.types.set('stream', class DataSourceTransformationStream extends DataSourceTransformation {

	get name() {
		return 'Stream';
	}

	async execute(response = []) {

		if(!response || !response.length) {
			return response;
		}

		if(!this.options.visualization_id) {
			return this.source.error('Stream visualization not selected!');
		}

		let report = null;

		for(const _report of DataSource.list.values()) {

			const [visualization] = _report.visualizations.filter(v => v.visualization_id == this.options.visualization_id);

			if(!visualization) {
				continue;
			}

			report = new DataSource(_report);
			break;
		}

		if(!report) {
			return this.source.error('Stream visualization not found!');
		}

		const filterFetches = [];

		[report.visualizations.selected] = report.visualizations.filter(v => v.visualization_id == this.options.visualization_id)

		for(const filter of report.filters.values()) {

			if(this.source.filters.has(filter.placeholder))
				filterFetches.push(filter.fetch());
		}

		await Promise.all(filterFetches);

		for(const filter of report.filters.values()) {

			if(this.source.filters.has(filter.placeholder)) {
				filter.value = this.source.filters.get(filter.placeholder).value;
			}
		}

		await report.fetch();

		const streamResponse = await report.response();

		const
			newResponse = [],
			newColumns = Array.from(streamResponse[0].keys()),
			filters = {};

		for(const filter of DataSourceColumnFilter.types) {
			filters[filter.slug] = filter;
		}

		for(const baseRow of response) {

			let newRow = [];

			for(const column of this.options.columns) {

				if(column.stream != 'base') {
					continue;
				}

				if(!(column.column in baseRow))
					continue;

				newRow[column.name || column.column] = column.column in baseRow ? baseRow[column.column] : '';
			}

			// Make a LEFT JOIN on the current row with the stream report
			for(const streamRow of streamResponse) {

				let joinsMatched = true;

				// If any of the stream's join conditions don't match then skip this row
				for(const join of this.options.joins) {

					if(!filters[join.function].apply(baseRow[join.sourceColumn], streamRow.get(join.streamColumn))) {
						joinsMatched = false;
					}
				}

				for(const column of this.options.columns) {

					if(column.stream != 'stream') {
						continue;
					}

					let joinGroup = [];

					if(!((column.name || column.column) in newRow)) {
						newRow[column.name || column.column] = joinGroup;
						joinGroup.column = column;
					}

					else {
						joinGroup = newRow[column.name || column.column];
					}

					if(joinsMatched && streamRow.has(column.column)) {
						joinGroup.push(streamRow.get(column.column));
					}
				}
			}

			for(const key in newRow) {

				const values = newRow[key];

				if(!Array.isArray(values)) {
					continue;
				}

				let value = null;

				switch(values.column.function) {

					case 'sum':
						value = values.reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
						break;

					case 'count':
						value = values.length;
						break;

					case 'distinctcount':
						value = new Set(values).size;
						break;

					case 'max':
						value = Math.max(...values);
						break;

					case 'min':
						value = Math.min(...values);
						break;

					case 'average':
						value = Math.floor(values.reduce((sum, value) => sum + (parseFloat(value) || 0), 0) / values.length * 100) / 100;
						break;

					case 'values':
						value = values.join(', ');
						break;

					case 'distinctvalues':
						value = Array.from(new Set(values)).join(', ');
						break;

					default:
						value = values.length;
				}

				{
					const row = [];

					for(const column of this.options.columns) {

						if((column.name || column.column) in newRow) {
							row[column.name || column.column] = newRow[column.name || column.column];
						}
					}

					newRow = row;
				}

				newRow[key] = value;
			}

			newResponse.push(newRow);
		}

		return newResponse;
	}
});

DataSourceTransformation.types.set('sort', class DataSourceTransformationRestrictColumns extends DataSourceTransformation {

	get name() {
		return 'Sort';
	}

	async execute(response = []) {

		if(!response || !response.length || !this.options.columns) {
			return response;
		}

		for(const column of this.options.columns) {

			column.options = {
				numeric: column.numeric != 'alphabetical',
				caseFirst: column.caseFirst || false,
			};
		}

		response = response.sort((a, b) => {

			for(const column of this.options.columns) {

				if(!(column.column in a) || !(column.column in b)) {
					continue;
				}

				if(a[column.column] === null || b[column.column] === null) {
					continue;
				}

				let result = null;

				if(this.implied) {
					result = a[column.column] < b[column.column] ? -1 : a[column.column] > b[column.column] ? 1 : 0;
				}

				else {
					result = a[column.column].toString().localeCompare(b[column.column].toString(), undefined, column.options);
				}

				if(!result) {
					continue;
				}

				if(column.order == 'descending') {
					result *= -1;
				}

				return result;
			}
		});

		return response;
	}
});

DataSourceTransformation.types.set('restrict-columns', class DataSourceTransformationRestrictColumns extends DataSourceTransformation {

	get name() {
		return 'Restrict Columns';
	}

	async execute(response = []) {

		if(!response || !response.length || !this.options.columns) {
			return response;
		}

		const newResponse = [];

		for(const data of response) {

			const temp = {};

			for(const key in data) {

				if(this.options.exclude) {

					if(!this.options.columns.includes(key)) {
						temp[key] = data[key];
					}
				}

				else if(this.options.columns.includes(key)) {
					temp[key] = data[key];
				}
			}

			newResponse.push(temp);
		}

		return newResponse;
	}
});

DataSourceTransformation.types.set('linear-regression', class DataSourceTransformationRestrictColumns extends DataSourceTransformation {

	get name() {

		return 'Linear Regression';
	}

	async execute(response = []) {

		if (!(this.options.columns && (this.options.columns.x || this.options.columns.y))) {

			return response;
		}

		this.xs = [], this.ys = [];

		try {
			if (Date.parse(response[0][this.options.columns.x])) {

				this.isDateX = true;
			}
		}
		catch (e) {
		}

		for (const row of response) {

			this.xs.push(this.isDateX ? +new Date(row[this.options.columns.x]) : parseFloat(row[this.options.columns.x]));
			this.ys.push(parseFloat(row[this.options.columns.y]));
		}

		const slope = this.slope();
		this.lineSlope = slope;
		this.yInterceptPoint = this.yIntercept(slope);

		for (const row of response) {

			row[`${this.options.columns.name} Linear Regression`] = slope * (this.isDateX ? +new Date(row[this.options.columns.x]) : row[this.options.columns.x]) + this.yInterceptPoint;
		}

		if (this.options.columns.extrapolate) {

			response = this.extrapolate(response);
		}

		return response;
	}

	mean(arr) {

		return +((arr.reduce((x, y) => +x + +y)) / arr.length).toFixed(2);
	}

	slope() {
		/*
			 mean(x) * mean(y) - mean(x * y)
			---------------------------------
			 mean(x) * mean(x) - mean(x * x)
		*/

		const
			meanX = this.mean(this.xs),
			meanXmeanY = meanX * this.mean(this.ys),
			meanXY = this.mean(this.xs.map((x, j) => x * this.ys[j])),
			meanXmeanX = meanX * meanX,
			meanXX = this.mean(this.xs.map(x => x * x))

		return (meanXmeanY - meanXY) / (meanXmeanX - meanXX);
	}

	yIntercept() {

		/*
		* Y = mX + c => c = Y - mX */

		return this.mean(this.ys) - this.lineSlope * this.mean(this.xs);
	}

	extrapolate(response) {

		const units = parseInt(this.options.columns.extrapolate);

		let
			extrapolatedData = [],
			lastRow = response[response.length - 1],
			otherColumns = Object.keys(response[0]).filter(x => ![this.options.columns.x, this.options.columns.x].includes(x)),
			asc = response.length > 1 ? response[response.length - 1][this.options.columns.x] > response[response.length - 2][this.options.columns.x] : false
		;

		switch (((this.source.columns.has(this.options.columns.x) && this.source.columns.get(this.options.columns.x).type) || {name: 'string'}).name) {

			case 'date':
			case 'string':

				const timingUnitSeconds = this.isDateX ? 24 * 60 * 60 * 1000 : (response[3] - response[0]) / 3;

				for (let y = 1; y <= units; y++) {

					const ip = (this.isDateX ? +new Date(lastRow[this.options.columns.x]) : +lastRow[this.options.columns.x]) + (y * timingUnitSeconds);
					const op = (this.lineSlope * ip) + this.yInterceptPoint;

					const row = {};

					row[this.options.columns.x] = new Date(ip).toISOString();
					row[`${this.options.columns.name} Linear Regression`] = op;

					otherColumns.forEach(x => row[x] = row[x] ? row[x] : 0);
					extrapolatedData.push(row);
				}

				break;

			case 'month':

				for (let x = 1; x <= units; x++) {

					let ip = new Date(lastRow[this.options.columns.x]);
					ip = ip.setMonth(ip.getMonth() + x);
					const op = this.lineSlope * ip + this.yInterceptPoint;

					const row = {};

					row[this.options.columns.x] = ip;
					row[`${this.options.columns.name} Linear Regression`] = op;

					otherColumns.forEach(x => row[x] = row[x] ? row[x] : 0);
					extrapolatedData.push(row);
				}

				break;
		}

		response = response.concat(asc ? extrapolatedData : extrapolatedData.reverse());

		return response;
	}
});

DataSourceTransformation.types.set('custom-column', class DataSourceTransformationCustomColumn extends DataSourceTransformation {

	get name() {
		return 'Custom Column';
	}

	async execute(response = []) {

		if(!response || !response.length || !this.options.formula)
			return response;

		const newResponse = [];

		for(const row of response) {

			let formula = this.options.formula;

			for(const key in row) {

				if(!formula.includes(`{{${key}}}`))
					continue;

				let value = parseFloat(row[key]);

				if(isNaN(value))
					value = `'${row[key]}'` || '';

				formula = formula.replace(new RegExp(`{{${key}}}`, 'gi'), value);
			}

			try {

				row[this.options.column] = eval(formula);

				if(!isNaN(parseFloat(row[this.options.column])))
					row[this.options.column] = parseFloat(row[this.options.column]);

			} catch(e) {
				row[this.options.column] = null;
			}

			newResponse.push(row);
		}

		return newResponse;
	}
});

DataSourceTransformation.types.set('row-limit', class DataSourceTransformationRowLimit extends DataSourceTransformation {

	get name() {

		return 'Row Limit';
	}

	async execute(response = []) {

		if(!response.length || !this.options.row_limit) {

			return response;
		}

		return response.slice(0, this.options.row_limit);
	}
});

DataSourcePostProcessors.processors = new Map;

DataSourcePostProcessors.processors.set('Orignal', class extends DataSourcePostProcessor {

	get name() {
		return 'No Filter';
	}

	get domain() {
		return new Map();
	}

	processor(response) {
		return response;
	}
});

DataSourcePostProcessors.processors.set('Weekday', class extends DataSourcePostProcessor {

	get name() {
		return 'Weekday';
	}

	get domain() {
		return new Map([
			[0, 'Sunday'],
			[1, 'Monday'],
			[2, 'Tuesday'],
			[3, 'Wednesday'],
			[4, 'Thursday'],
			[5, 'Friday'],
			[6, 'Saturday'],
		]);
	}

	processor(response) {

		const timingColumn = this.source.postProcessors.timingColumn;

		if(!timingColumn || !this.source.columns.has(timingColumn.key)) {
			return response;
		}

		return response.filter(r => new Date(r.get(timingColumn.key)).getDay() == this.value)
	}
});

DataSourcePostProcessors.processors.set('CollapseToAverage', class extends DataSourcePostProcessor {

	get name() {
		return 'Collapse To (Average)';
	}

	get domain() {

		return new Map([
			['second', 'Second'],
			['minute', 'Minute'],
			['hour', 'Hour'],
			['day', 'Day'],
			['week', 'Week'],
			['month', 'Month'],
		]);
	}

	processor(response) {

		const timingColumn = this.source.postProcessors.timingColumn;

		if(!timingColumn || !this.source.columns.has(timingColumn.key)) {
			return response;
		}

		const result = new Map;

		let monthCount;

		for(const row of response) {

			let
				period,
				timing;

			const periodDate = new Date(row.get(timingColumn.key));

			// Week starts from monday, not sunday
			if(this.value == 'week') {
				period = (periodDate.getDay() ? periodDate.getDay() - 1 : 6) * 24 * 60 * 60 * 1000;
				timing = new Date(Date.parse(row.get(timingColumn.key)) - period).toISOString().substring(0, 10);
			}

			else if(this.value == 'month') {
				period = (periodDate.getDate() - 1) * 24 * 60 * 60 * 1000;
				timing = new Date(Date.parse(row.get(timingColumn.key)) - period).toISOString().substring(0, 10);

				if(monthCount && (monthCount != timing)) {

					const count = new Date(new Date(monthCount).getFullYear(), new Date(monthCount).getMonth() + 1, 0).getDate();

					const xx = result.get(monthCount);

					for(const [key, value] of row) {

						if(!isNaN(value)) {
							xx.set(key, xx.get(key) / count);
						}
					}
				}

				monthCount = timing;
			}

			else if(this.value == 'day') {
				period = periodDate.getHours() * 60 * 60 * 1000;
				timing = new Date(Date.parse(row.get(timingColumn.key)) - period).toISOString().substring(0, 10);
			}

			else if(this.value == 'hour') {
				period = periodDate.getMinutes() * 60 * 1000;
				timing = new Date(Date.parse(row.get(timingColumn.key)) - period).toISOString().substring(0, 13) + ':00:00';
			}

			else if(this.value == 'minute') {
				period = periodDate.getSeconds() * 1000;
				timing = new Date(Date.parse(row.get(timingColumn.key)) - period).toISOString().substring(0, 16) + ':00';
			}

			else if(this.value == 'second') {
				period = periodDate.getMilliseconds() * 1000;
				timing = new Date(Date.parse(row.get(timingColumn.key)) - period).toISOString().substring(0, 19);
			}

			if(!result.has(timing)) {

				result.set(timing, new DataSourceRow(null, this.source));

				let newRow = result.get(timing);

				for(const key of row.keys()) {
					newRow.set(key, 0);
				}
			}

			const newRow = result.get(timing);

			for(const [key, value] of row) {

				if(!isNaN(parseFloat(value))) {
					newRow.set(key, newRow.get(key) + parseFloat(value));
				}
			}

			newRow.set(timingColumn.key, timing);
		}

		const countArray = {
			'week' : 7,
			'day' : 1,
			'hour' : 60,
			'minute' : 60,
			'second' : 1000,
		}

		if(this.value != 'month') {

			for(const row of [...result.values()]) {

				for(const [key, value] of row) {

					if(!isNaN(value)) {
						row.set(key, row.get(key) / countArray[this.value])
					}
				}
			}
		}

		if(!timingColumn.type.originalName) {
			timingColumn.type.originalName = timingColumn.type.name;
		}

		if(['week', 'day'].includes(this.value))  {
			timingColumn.type.name = 'date';
		}

		else if(['month'].includes(this.value)) {
			timingColumn.type.name = 'month';
		}

		else if(['hour', 'minute', 'second'].includes(this.value)) {
			timingColumn.type.name = 'datetime';
		}

		return Array.from(result.values());
	}
});

DataSourcePostProcessors.processors.set('CollapseTo', class extends DataSourcePostProcessor {

	get name() {
		return 'Collapse To (Sum)';
	}

	get domain() {

		return new Map([
			['second', 'Second'],
			['minute', 'Minute'],
			['hour', 'Hour'],
			['day', 'Day'],
			['week', 'Week'],
			['month', 'Month'],
		]);
	}

	processor(response) {

		const timingColumn = this.source.postProcessors.timingColumn;

		if(!timingColumn || !this.source.columns.has(timingColumn.key)) {
			return response;
		}

		const result = new Map;

		for(const row of response) {

			let
				period,
				timing;

			const periodDate = new Date(row.get(timingColumn.key));

			// Week starts from monday, not sunday
			if(this.value == 'week') {
				period = (periodDate.getDay() ? periodDate.getDay() - 1 : 6) * 24 * 60 * 60 * 1000;
				timing = new Date(Date.parse(row.get(timingColumn.key)) - period).toISOString().substring(0, 10);
			}

			else if(this.value == 'month') {
				period = (periodDate.getDate() - 1) * 24 * 60 * 60 * 1000;
				timing = new Date(Date.parse(row.get(timingColumn.key)) - period).toISOString().substring(0, 10);
			}

			else if(this.value == 'day') {
				period = periodDate.getHours() * 60 * 60 * 1000;
				timing = new Date(Date.parse(row.get(timingColumn.key)) - period).toISOString().substring(0, 10);
			}

			else if(this.value == 'hour') {
				period = periodDate.getMinutes() * 60 * 1000;
				timing = new Date(Date.parse(row.get(timingColumn.key)) - period).toISOString().substring(0, 13) + ':00:00';
			}

			else if(this.value == 'minute') {
				period = periodDate.getSeconds() * 1000;
				timing = new Date(Date.parse(row.get(timingColumn.key)) - period).toISOString().substring(0, 16) + ':00';
			}

			else if(this.value == 'second') {
				period = periodDate.getMilliseconds() * 1000;
				timing = new Date(Date.parse(row.get(timingColumn.key)) - period).toISOString().substring(0, 19);
			}

			if(!result.has(timing)) {

				result.set(timing, new DataSourceRow(null, this.source));

				let newRow = result.get(timing);

				for(const key of row.keys()) {
					newRow.set(key, 0);
				}
			}

			const newRow = result.get(timing);

			for(const [key, value] of row) {

				if(!isNaN(parseFloat(value))) {
					newRow.set(key, newRow.get(key) + parseFloat(value));
				}
			}

			newRow.set(timingColumn.key, timing);
		}

		if(!timingColumn.type.originalName) {
			timingColumn.type.originalName = timingColumn.type.name;
		}

		if(['week', 'day'].includes(this.value)) {
			timingColumn.type.name = 'date';
		}

		else if(['month'].includes(this.value)) {
			timingColumn.type.name = 'month';
		}

		else if(['hour', 'minute', 'second'].includes(this.value)) {
			timingColumn.type.name = 'datetime';
		}

		return Array.from(result.values());
	}
});

DataSourcePostProcessors.processors.set('RollingAverage', class extends DataSourcePostProcessor {

	get name() {
		return 'Rolling Average';
	}

	get domain() {

		return new Map([
			[7, '7 Days'],
			[14, '14 Days'],
			[30, '30 Days'],
		]);
	}

	processor(response) {

		const timingColumn = this.source.postProcessors.timingColumn;

		if(!timingColumn || !this.source.columns.has(timingColumn.key)) {
			return response;
		}

		const
			result = new Map,
			copy = new Map;

		for(const row of response) {
			copy.set(Date.parse(row.get(timingColumn.key)), row);
		}

		for(const [timing, row] of copy) {

			if(!result.has(timing)) {

				result.set(timing, new DataSourceRow(null, this.source));

				let newRow = result.get(timing);

				for(const key of row.keys()) {
					newRow.set(key, 0);
				}
			}

			const newRow = result.get(timing);

			for(let i = 0; i < this.value; i++) {

				const element = copy.get(timing - i * 24 * 60 * 60 * 1000);

				if(!element) {
					continue;
				}

				for(const [key, value] of newRow) {

					if(!isNaN(parseFloat(value))) {
						newRow.set(key,  value + (element.get(key) / this.value));
					}
				}
			}

			newRow.set(timingColumn.key, row.get(timingColumn.key));
		}

		return Array.from(result.values());
	}
});

DataSourcePostProcessors.processors.set('RollingSum', class extends DataSourcePostProcessor {

	get name() {
		return 'Rolling Sum';
	}

	get domain() {

		return new Map([
			[7, '7 Days'],
			[14, '14 Days'],
			[30, '30 Days'],
		]);
	}

	processor(response) {

		const timingColumn = this.source.postProcessors.timingColumn;

		if(!timingColumn || !this.source.columns.has(timingColumn.key)) {
			return response;
		}

		const
			result = new Map,
			copy = new Map;

		for(const row of response) {
			copy.set(Date.parse(row.get(timingColumn.key)), row);
		}

		for(const [timing, row] of copy) {

			if(!result.has(timing)) {

				result.set(timing, new DataSourceRow(null, this.source));

				let newRow = result.get(timing);

				for(const key of row.keys()) {
					newRow.set(key, 0);
				}
			}

			const newRow = result.get(timing);

			for(let i = 0; i < this.value; i++) {

				const element = copy.get(timing - i * 24 * 60 * 60 * 1000);

				if(!element) {
					continue;
				}

				for(const [key, value] of newRow) {

					if(!isNaN(parseFloat(value)) && !isNaN(parseFloat(element.get(key)))) {
						newRow.set(key,  value + parseFloat(element.get(key)));
					}
				}
			}

			newRow.set(timingColumn.key, row.get(timingColumn.key));
		}

		return Array.from(result.values());
	}
});

class DataSourcePipeline extends Set {

	constructor(source) {

		super();
		this.source = source;
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');

		container.classList.add('overlay', 'pipeline', 'hidden');

		container.innerHTML = `
			<span class="close" title="close">&times;</span>
			<div class="snapshot"><div class="NA">Snapshot Not Available</div></div>
			<div class="list"></div>
		`;

		container.querySelector('.close').on('click', () => this.source.menu.querySelector('.pipeline-toggle').click());

		this.render();

		return container;
	}

	render() {

		if(!this.containerElement)
			return;

		const container = this.container.querySelector('.list');

		container.textContent = null;

		for(const event of this) {

			container.appendChild(event.container);

			if(event.order != this.size) {

				container.insertAdjacentHTML('beforeend', `
					<div class="next-connector"><i class="fas fa-long-arrow-alt-down"></i></div>
				`);
			}
		}

		if(!this.size)
			container.innerHTML = '<div class="NA">Data Pipeline Not available.</div>';
	}

	add(event) {

		event.order = this.size + 1;

		super.add(event);
		this.render();
	}
}

class DataSourcePipelineEvent {

	constructor(properties) {

		for(const key in properties) {
			this[key] = properties[key];
		}
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('event');

		container.innerHTML = `
			<div class="order">${Format.number(this.order)}</div>
			<h2>${this.title}</h2>
		`;

		if(this.disabled) {
			container.classList.add('disabled');
			container.insertAdjacentHTML('beforeend', `<span class="NA">Disabled</span>`);
		}

		if(this.subtitle && this.subtitle.length) {

			const subtitleContainer = document.createElement('div');

			subtitleContainer.classList.add('subtitle');

			for(const subtitle of this.subtitle) {

				subtitleContainer.insertAdjacentHTML('beforeend', `
					<span>${subtitle.key}: <strong>${subtitle.value}</strong></span>
				`);
			}

			container.appendChild(subtitleContainer);
		}

		return container;
	}
}

class Visualization {

	constructor(visualization, source) {

		for(const key in visualization) {
			this[key] = visualization[key];
		}

		this.id = Math.floor(Math.random() * 100000);

		this.source = source;

		if(this.options && typeof this.options == 'string') {

			try {
				this.options = JSON.parse(this.options);
			} catch(e) {}
		}

		if(!this.options) {
			this.options = {};
		}

		for(const key in this.options) {
			this[key] = this.options[key];
		}
	}

	render() {

		this.source.container.querySelector('h2 .title').textContent = this.name;

		const visualizationToggle = this.source.container.querySelector('header .change-visualization');

		if(visualizationToggle) {
			visualizationToggle.value = this.source.visualizations.indexOf(this);
		}

		this.source.container.removeChild(this.source.container.querySelector('.visualization'));

		this.source.visualizations.selected = this;

		this.source.container.appendChild(this.container);
		this.source.container.querySelector('.columns').classList.remove('hidden');

		const configure = this.source.container.querySelector('.menu .configure-visualization');

		if(configure) {

			if(this.visualization_id) {
				configure.href = `/reports/configure-visualization/${this.visualization_id}`;
			}

			configure.classList.toggle('hidden', !this.visualization_id);
		}

		this.source.resetError();
	}

	async showSubVisualizations() {

		if(!this.related_visualizations || !this.related_visualizations.length) {
			return;
		}

		if(this.subReportDialogBox) {

			this.subReportDialogBox.show();
			return;
		}

		this.subReportDialogBox = new DialogBox();
		this.subReportDialogBox.container.classList.add('sub-reports-dialog');
		this.subReportDialogBox.heading = this.name;

		this.subReportDialogBox.body.textContent = null;

		const visualizationCanvas =  new Canvas(this.related_visualizations, page);
		this.subReportDialogBox.body.appendChild(visualizationCanvas.container);

		await visualizationCanvas.load();
		this.subReportDialogBox.show();
	}
}

class LinearVisualization extends Visualization {

	constructor(visualization, source) {

		super(visualization, source);

		for(const axis of this.axes || []) {

			this.axes[axis.position] = axis;
			axis.column = axis.columns.length ? axis.columns[0].key : '';
		}
	}

	async draw() {

		const rows = await this.source.response();

		if(!rows || !rows.length) {
			return this.source.error();
		}

		if(!this.axes) {
			return this.source.error('Axes not defined.');
		}

		for(const axis of this.axes) {

			if(!axis.restcolumns) {
				continue;
			}

			axis.columns = [];

			for(const key of this.source.columns.keys()) {

				if(!this.axes.some(a => a.columns.some(c => c.key == key))) {
					axis.columns.push({key});
				}
			}

			axis.column = axis.columns.length ? axis.columns[0].key : '';
		}

		if(!this.axes.bottom) {
			return this.source.error('Bottom axis not defined.');
		}

		if(!this.axes.left) {
			return this.source.error('Left axis not defined.');
		}

		if(!this.axes.bottom.columns.length) {
			return this.source.error('Bottom axis requires exactly one column.');
		}

		if(!this.axes.left.columns.length) {
			return this.source.error('Left axis requires atleast one column.');
		}

		if(this.axes.bottom.columns.length > 1) {
			return this.source.error('Bottom axis cannot has more than one column.');
		}

		for(const column of this.axes.bottom.columns) {
			if(!this.source.columns.get(column.key)) {
				return this.source.error(`Bottom axis column <em>${column.key}</em> not found.`);
			}
		}

		for(const column of this.axes.left.columns) {
			if(!this.source.columns.get(column.key)) {
				return this.source.error(`Left axis column <em>${column.key}</em> not found.`);
			}
		}

		for(const bottom of this.axes.bottom.columns) {
			for(const left of this.axes.left.columns) {

				if(bottom.key == left.key) {
					return this.source.error(`Column <em>${bottom.key}</em> cannot be on both axis.`);
				}
			}
		}

		for(const [key, column] of this.source.columns) {

			if(this.axes.left.columns.some(c => c.key == key) || (this.axes.right && this.axes.right.columns.some(c => c.key == key)) || this.axes.bottom.columns.some(c => c.key == key)) {
				continue;
			}

			column.hidden = true;
			column.render();
		}

		this.source.columns.overFlow();

		for(const column of this.axes.bottom.columns) {
			if(!this.source.columns.get(column.key)) {
				return this.source.error(`Bottom axis column <em>${column.key}</em> not found.`);
			}
		}

		if(this.axes.bottom.columns.every(c => this.source.columns.get(c.key).disabled)) {
			return this.source.error('Bottom axis requires atleast one column.');
		}

		if(this.axes.left.columns.every(c => this.source.columns.get(c.key).disabled)) {
			return this.source.error('Left axis requires atleast one column.');
		}

		this.axes.bottom.height = 25;
		this.axes.left.width = 50;

		if(this.axes.bottom.label) {
			this.axes.bottom.height += 20;
		}

		if(this.axes.left.label) {
			this.axes.left.width += 20;
		}

		this.height = this.container.clientHeight - this.axes.bottom.height - 20;
		this.width = this.container.clientWidth - this.axes.left.width - 40;

		for(const row of rows) {
			for(const [key, column] of row) {
				row.set(key, row.getTypedValue(key));
			}
		}

		this.rows = rows;
		this.originalLength = rows.length;

		window.addEventListener('resize', () => {

			const
				height = this.container.clientHeight - this.axes.bottom.height - 20,
				width = this.container.clientWidth - this.axes.left.width - 40;

			if(this.width != width || this.height != height) {

				this.width = width;
				this.height = height;

				this.plot({resize: true});
			}
		});
	}

	plot(options = {}) {

		const container = d3.selectAll(`#visualization-${this.id}`);

		container.selectAll('*').remove();

		if(!this.rows) {
			return;
		}

		if(!this.axes) {
			return this.source.error('Bottom axis not defined.');
		}

		this.columns = {};

		for(const row of this.rows) {

			for(const [key, _] of row) {

				if(key == this.axes.bottom.column) {
					continue;
				}

				if((!this.axes.left || !this.axes.left.columns.some(c => c.key == key)) && (!this.axes.right || !this.axes.right.columns.some(c => c.key == key))) {
					continue;
				}

				const column = this.source.columns.get(key);

				if(!column || column.disabled) {
					continue;
				}

				if(!this.columns[key]) {
					this.columns[key] = [];
					Object.assign(this.columns[key], column);
				}

				this.columns[key].push({
					x: row.get(this.axes.bottom.column),
					y: row.get(key),
					y1: this.axes.right ? row.get(this.axes.right.column) : null,
					key,
					row,
				});
			}
		}

		this.columns = Object.values(this.columns);

		this.svg = container
			.append('svg')
			.append('g')
			.attr('class', 'chart');

		if(!this.rows.length) {
			return this.source.error();
		}

		if(this.rows.length != this.originalLength) {

			// Reset Zoom Button
			const resetZoom = this.svg.append('g')
				.attr('class', 'reset-zoom')
				.attr('y', 0)
				.attr('x', (this.width / 2) - 35);

			resetZoom.append('rect')
				.attr('width', 80)
				.attr('height', 20)
				.attr('y', 0)
				.attr('x', (this.width / 2) - 35);

			resetZoom.append('text')
				.attr('y', 15)
				.attr('x', (this.width / 2) - 35 + 40)
				.attr('text-anchor', 'middle')
				.style('font-size', '12px')
				.text('Reset Zoom');

			// Click on reset zoom function
			resetZoom.on('click', async () => {

				const rows = await this.source.response();

				for(const row of rows) {
					for(const [key, column] of row) {
						row.set(key, row.getTypedValue(key));
					}
				}

				this.rows = rows;

				this.plot();
			});
		}

		const that = this;

		this.zoomRectangle = null;

		container

		.on('mousemove', function() {

			const mouse = d3.mouse(this);

			if(that.zoomRectangle) {

				const
					filteredRows = [],
					width = Math.abs(mouse[0] - 10 - that.zoomRectangle.origin[0]);

				for(const row of that.rows) {

					const item = that.x(row.get(that.axes.bottom.column)) + that.axes.left.width + 10;

					if(
						(mouse[0] < that.zoomRectangle.origin[0] && item >= mouse[0] && item <= that.zoomRectangle.origin[0]) ||
						(mouse[0] >= that.zoomRectangle.origin[0] && item <= mouse[0] && item >= that.zoomRectangle.origin[0])
					)
						filteredRows.push(row);
				}

				// Assign width and height to the rectangle
				that.zoomRectangle
					.select('rect')
					.attr('x', Math.min(that.zoomRectangle.origin[0], mouse[0] - 10))
					.attr('width', width)
					.attr('height', that.height);

				that.zoomRectangle
					.select('g')
					.selectAll('*')
					.remove();

				that.zoomRectangle
					.select('g')
					.append('text')
					.text(`${Format.number(filteredRows.length)} Selected`)
					.attr('x', Math.min(that.zoomRectangle.origin[0], mouse[0]) + (width / 2))
					.attr('y', (that.height / 2) - 5);

				if(filteredRows.length) {

					that.zoomRectangle
						.select('g')
						.append('text')
						.text(`${filteredRows[0].get(that.axes.bottom.column)} - ${filteredRows[filteredRows.length - 1].get(that.axes.bottom.column)}`)
						.attr('x', Math.min(that.zoomRectangle.origin[0], mouse[0]) + (width / 2))
						.attr('y', (that.height / 2) + 20);
				}

				return;
			}

			const row = that.rows[parseInt((mouse[0] - that.axes.left.width - 10) / (that.width / that.rows.length))];

			if(!row) {
				return;
			}

			const tooltip = [];

			for(const [key, _] of row) {

				if(key == that.axes.bottom.column) {
					continue;
				}

				const column = row.source.columns.get(key);

				if(column.hidden) {
					continue;
				}

				tooltip.push(`
					<li class="${row.size > 2 && that.hoverColumn && that.hoverColumn.key == key ? 'hover' : ''}">
						<span class="circle" style="background:${column.color}"></span>
						<span>
							${column.drilldown && column.drilldown.query_id ? '<i class="fas fa-angle-double-down"></i>' : ''}
							${column.name}
						</span>
						<span class="value">${Format.number(row.get(key))}</span>
					</li>
				`);
			}

			const content = `
				<header>${row.get(that.axes.bottom.column)}</header>
				<ul class="body">
					${tooltip.reverse().join('')}
				</ul>
			`;

			if(that.container.querySelector('.loading')) {
				return;
			}

			Tooltip.show(that.container, mouse, content, row);
		})

		.on('mouseleave', function() {
			Tooltip.hide(that.container);
		})

		.on('mousedown', function() {

			Tooltip.hide(that.container);

			if(that.zoomRectangle) {
				return;
			}

			that.zoomRectangle = container.select('svg').append('g');

			that.zoomRectangle
				.attr('class', 'zoom')
				.style('text-anchor', 'middle')
				.append('rect')
				.attr('class', 'zoom-rectangle');

			that.zoomRectangle
				.append('g');


			that.zoomRectangle.origin = d3.mouse(this);
			that.zoomRectangle.origin[0] -= 10;
			that.zoomRectangle.origin[1] -= 10;
		})

		.on('mouseup', function() {

			if(!that.zoomRectangle) {
				return;
			}

			that.zoomRectangle.remove();

			const
				mouse = d3.mouse(this),
				width = Math.abs(that.zoomRectangle.origin[0] - mouse[0]),
				filteredRows = that.rows.filter(row => {

					const item = that.x(row.get(that.axes.bottom.column)) + that.axes.left.width + 10;

					if(mouse[0] < that.zoomRectangle.origin[0]) {
						return item >= mouse[0] && item <= that.zoomRectangle.origin[0];
					}
					else {
						return item <= mouse[0] && item >= that.zoomRectangle.origin[0];
					}
				});

			that.zoomRectangle = null;

			// Width check to make sure the zoom rectangle has substantial width
			if(filteredRows.length < 2 || width <= 10) {
				return;
			}

			that.rows = filteredRows;

			that.plot();
		}, true);
	}
}

Visualization.list = new Map;

Visualization.list.set('table', class Table extends Visualization {

	constructor(visualization, source) {

		super(visualization, source);

		this.rowLimit = 15;
		this.rowLimitMultiplier = 1.75;
		this.selectedRows = new Set;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `
			<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
		`;

		await this.source.fetch(options);

		await this.render(options);
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('section');

		container.classList.add('visualization', 'table');

		container.innerHTML = `
			<div class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	process() {

		if(!this.options || !this.options.gradientRules) {
			return;
		}

		for(const gradient of this.options.gradientRules) {

			if(!gradient.gradientThreshold || gradient.gradientThreshold > 100) {
				gradient.gradientThreshold = 100;
			}

			if(!this.rows.filter(f => f.get(gradient.column)).length || !this.rows.filter(f => f.get(gradient.relative)).length) {
				continue;
			}

			for(const row of this.rows) {

				const _row = row.get(gradient.relative);

				if(!isNaN(_row)) {

					if((!gradient.maxValue && gradient.maxValue != 0)) {
						gradient.maxValue = _row;
					}

					if((!gradient.minValue && gradient.minValue != 0)) {
						gradient.minValue = _row;
					}

					if(gradient.maxValue < _row) {
						gradient.maxValue = _row;
					}

					else if(gradient.minValue > _row) {
						gradient.minValue = _row;
					}
				}
			}
		}
	}

	async render(options = {}) {

		const container = this.container.querySelector('.container');

		this.rows = await this.source.response() || [];

		this.source.resetError();

		this.process();

		container.textContent = null;

		const
			table = document.createElement('table'),
			thead = document.createElement('thead'),
			search = document.createElement('tr'),
			headings = document.createElement('tr'),
			rowCount = document.createElement('div');

		search.classList.add('search');

		let columns = this.source.columns.list;

		if(!columns.size && this.source.transformations.size) {
			columns = Array.from(this.source.transformations).pop().incoming.columns;
		}

		for(const column of columns.values()) {

			const container = document.createElement('th');

			container.classList.add('heading');

			container.innerHTML = `
				<div>
					<span class="name">
						${column.drilldown && column.drilldown.query_id ? '<span class="drilldown"><i class="fas fa-angle-double-down"></i></span>' : ''}
						${column.name}
					</span>
					<div class="filter-popup"><span>&#9698;</span></div>
					<div class="hidden popup-dropdown"></div>
				</div>
			`;

			document.querySelector('body').on('click', () => {
				container.querySelector('.popup-dropdown').classList.add('hidden')
				container.querySelector('.filter-popup span').classList.remove('open');
			});

			container.on('click', () => {

				let [format] = this.source.format.columns.filter(_column => _column.key == column.key);

				if(!format) {
					this.source.format.columns.push(format = {key: column.key});
				}

				if(parseInt(format.sort) == 1) {
					format.sort = 0;
					column.sort = 0;
				}

				else {
					format.sort = 1;
					column.sort = 1;
				}

				this.source.columns.sortBy = column;
				this.source.visualizations.selected.render();
			});

			container.querySelector('.filter-popup').on('click', e => {

				column.dialogueBox;

				e.stopPropagation();

				for(const key in column) {

					if(key in column.form) {
						column.form[key].value = column[key];
					}
				}

				for(const node of container.parentElement.querySelectorAll('th')) {
					node.querySelector('.popup-dropdown').classList.add('hidden');
					node.querySelector('.filter-popup span').classList.remove('open');
				}

				e.currentTarget.querySelector('span').classList.add('open');

				column.form.classList.add('compact');

				container.querySelector('.popup-dropdown').appendChild(column.form);

				container.querySelector('.popup-dropdown').classList.remove('hidden');
			});

			const accumulations = column.form.querySelectorAll('.accumulation-type');

			if(column.columnAccumulations.size) {

				for(const accumulation of column.columnAccumulations) {
					accumulation.run();
				}
			}

			if(column.filters && column.filters.length) {
				container.classList.add('has-filter');
			}

			headings.appendChild(container);
		}

		if(!this.hideHeadingsBar) {
			thead.appendChild(headings);
		}

		if(thead.children.length) {
			table.appendChild(thead);
		}

		const gradientRules = {};

		if(this.options && this.options.gradientRules) {

			for(const rule of this.options.gradientRules) {
				gradientRules[rule.column] = rule;
			}
		}

		const tbody = document.createElement('tbody');

		for(const [position, row] of this.rows.entries()) {

			if(position >= this.rowLimit) {
				break;
			}

			const tr = row.tr = document.createElement('tr');

			for(const [key, column] of this.source.columns.list) {

				const td = document.createElement('td');

				let rowJson = row.get(key);

				let typedValue = row.getTypedValue(key);

				const rule = gradientRules[key];

				if(rule && rule.maxValue && (rule.currentValue = row.get(rule.relative))) {

					rule.position = rule.currentValue >= parseFloat((rule.maxValue - rule.minValue) / 2);

					const
						colorValue = parseInt(rule.gradientThreshold / 100 * this.cellColorValue(rule)),
						colorPercent = (rule.currentValue / rule.maxValue * 100).toFixed(2) + '%';

					if(rule.content == 'empty') {
						typedValue = null;
					}

					else if(rule.content == 'percentage') {
						typedValue = colorPercent;
					}

					else if(rule.content == 'both') {
						typedValue =  typedValue + ' / ' + colorPercent;
					}

					let backgroundColor;

					if(rule.dualColor) {
						backgroundColor = (rule.position ? rule.maximumColor : rule.minimumColor) + colorValue.toString(16);
					}
					else {
						backgroundColor = rule.maximumColor + colorValue.toString(16);
					}

					td.style.backgroundColor = backgroundColor;

					if(colorValue > 155) {

						if (this.cellLuma(backgroundColor) <= 60) {
							td.classList.add('column-cell-white');
						}

						else {
							td.classList.add('column-cell-dark');
						}
					}
				}

				if(column.type && column.type.name == 'html') {
					td.innerHTML = typedValue;
				}

				else if((column.type && column.type.name == 'json') || rowJson && typeof rowJson == 'object') {

					try {

						if(typeof rowJson == 'string') {
							rowJson = JSON.parse(rowJson);
						}
					}
					catch(e) {};

					td.innerHTML = `
						<span class="value">${Array.isArray(rowJson) ? '[ Array: ' + rowJson.length + ' ]' : '{ Object: ' + Object.keys(rowJson).length + ' }'}</span>
					`;

					td.classList.add('json');

					const tdValue = td.querySelector('.value');

					td.on('click', (e) => {

						e.stopPropagation();

						tdValue.classList.add('hidden');

						if(td.editorContainer) {
							return td.appendChild(td.editorContainer);
						}

						td.editorContainer = document.createElement('div');

						td.editorContainer.innerHTML = `
							<span class="close" title="Close"><i class="fa fa-times"></i></span>
						`;

						const editor = new CodeEditor({mode: 'json'});

						editor.editor.setTheme('ace/theme/clouds');
						td.editorContainer.appendChild(editor.container);

						editor.value = JSON.stringify(rowJson, 0 , 4);

						td.editorContainer.on('click', e => e.stopPropagation());

						td.editorContainer.querySelector('.close').on('click', e => {

							e.stopPropagation();
							td.editorContainer.remove();
							tdValue.classList.remove('hidden');
						});

						td.appendChild(td.editorContainer);
					});
				}
				else {

					td.textContent = typedValue;
				}

				if(column.drilldown && column.drilldown.query_id && DataSource.list.has(column.drilldown.query_id)) {

					td.classList.add('drilldown');
					td.on('click', () => column.initiateDrilldown(row));

					td.title = `Drill down into ${DataSource.list.get(column.drilldown.query_id).name}!`;
				}

				tr.appendChild(td);
			}

			tr.on('click', () => {

				if(this.selectedRows.has(row)) {
					this.selectedRows.delete(row);
				}
				else {
					this.selectedRows.add(row);
				}

				tr.classList.toggle('selected');

				this.renderRowSummary();
			});

			if(!options.resize) {
				tr.classList.add('initial');
				setTimeout(() => window.requestAnimationFrame(() => tr.classList.remove('initial')), position * 50);
			}

			tbody.appendChild(tr);
		}

		if(this.rows.length > this.rowLimit) {

			const tr = document.createElement('tr');

			tr.classList.add('show-rows');

			tr.innerHTML = `
				<td colspan="${this.source.columns.list.size}">
					<i class="fa fa-angle-down"></i>
					<span>Show ${parseInt(Math.ceil(this.rowLimit * this.rowLimitMultiplier) - this.rowLimit)} more rows</span>
					<i class="fa fa-angle-down"></i>
				</td>
			`;

			tr.on('click', () => {
				this.rowLimit = Math.ceil(this.rowLimit * this.rowLimitMultiplier);
				this.source.visualizations.selected.render({resize: true});
			});

			tbody.appendChild(tr);
		}

		if(!this.rows.length) {

			tbody.insertAdjacentHTML('beforeend', `
				<tr class="NA">
					<td colspan="${this.source.columns.size}">
						${this.source.originalResponse && this.source.originalResponse.message ? this.source.originalResponse.message : 'No data found!'}
					</td>
				</tr>
			`);
		}

		rowCount.classList.add('row-summary');

		rowCount.innerHTML = `
			<span class="selected-rows hidden">
				<span class="label">Selected:</span>
				<strong title="Number of selected rows"></strong>
			</span>
			<span>
				<span class="label">Showing:</span>
				<strong title="Number of rows currently shown on screen">
					${Format.number(Math.min(this.rowLimit, this.rows.length))}
				</strong>
			</span>
			<span>
				<span class="label">Filtered:</span>
				<strong title="Number of rows that match any search or grouping criterion">
					${Format.number(this.rows.length)}
				</strong>
			</span>
			<span>
				<span class="label">Total:</span>
				<strong title="Total number of rows in the dataset">
					${Format.number(this.source.originalResponse && this.source.originalResponse.data ? this.source.originalResponse.data.length : 0)}
				</strong>
			</span>
		`;

		table.appendChild(tbody);
		container.appendChild(table);

		if(!this.hideRowSummary) {
			container.appendChild(rowCount);
		}
	}

	renderRowSummary() {

		if(this.hideRowSummary) {
			return;
		}

		const container = this.container.querySelector('.row-summary .selected-rows');

		container.classList.toggle('hidden', !this.selectedRows.size);
		container.querySelector('strong').textContent = Format.number(this.selectedRows.size);
	}

	cellColorValue(rule) {

		const
			range = rule.maxValue - rule.minValue,
			value = Math.floor(17 + (238/range) * (rule.currentValue - rule.minValue));

		if(!range) {
			return 255;
		}

		if(rule.dualColor) {

			if(rule.position) {
				return value;
			}
			else {
				return Math.floor(17 + (238/range) * (rule.maxValue - rule.currentValue));
			}
		}

		return value;
	}

	cellLuma(hex) {

		hex = hex.substring(1, 7);

		const
			rgb = parseInt(hex, 16),
			r = (rgb >> 16) & 0xff,
			g = (rgb >> 8) & 0xff,
			b = (rgb >> 0) & 0xff
		;
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
   }
});

Visualization.list.set('line', class Line extends LinearVisualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization', 'line');
		container.innerHTML = `
			<div id="visualization-${this.id}" class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>`;

		await this.source.fetch(options);

		await this.render(options);
	}

	async render(options = {}) {

		await this.draw();

		this.plot(options);
	}

	plot(options = {}) {

		super.plot(options);

		if(!this.rows || !this.rows.length) {
			return;
		}

		const
			container = d3.selectAll(`#visualization-${this.id}`),
			that = this;

		this.x = d3.scale.ordinal();
		this.y = d3.scale.linear().range([this.height, 20]);

		const
			x1 = d3.scale.ordinal(),
			xAxis = d3.svg.axis()
				.scale(this.x)
				.orient('bottom'),

			yAxis = d3.svg.axis()
				.scale(this.y)
				.innerTickSize(-this.width)
				.orient('left');

		if(['s'].includes(this.axes.bottom.format)) {
			xAxis.tickFormat(d3.format(this.axes.left.format));
		}

		if(['s'].includes(this.axes.left.format)) {
			yAxis.tickFormat(d3.format(this.axes.left.format));
		}

		let
			max = null,
			min = null;

		for(const column of this.columns) {

			for(const row of column) {

				if(max == null) {
					max = Math.ceil(row.y);
				}

				if(min == null) {
					min = Math.floor(row.y);
				}

				max = Math.max(max, Math.ceil(row.y) || 0);
				min = Math.min(min, Math.floor(row.y) || 0);
			}
		}

		this.y.domain([min, max]);
		this.x.domain(this.rows.map(r => r.get(this.axes.bottom.column)));
		this.x.rangePoints([0, this.width], 0.1, 0);

		const
			biggestTick = this.x.domain().reduce((s, v) => s.length > v.length ? s : v, ''),
			tickNumber = Math.max(Math.floor(this.container.clientWidth / (biggestTick.length * 12)), 1),
			tickInterval = parseInt(this.x.domain().length / tickNumber),
			ticks = this.x.domain().filter((d, i) => !(i % tickInterval));

		xAxis.tickValues(ticks);
		x1.domain(this.columns.map(c => c.name)).rangeBands([0, this.x.rangeBand()]);

		this.svg
			.append('g')
			.attr('class', 'y scale')
			.call(yAxis)
			.attr('transform', `translate(${this.axes.left.width}, 0)`);

		this.svg
			.append('g')
			.attr('class', 'x scale')
			.attr('transform', `translate(${this.axes.left.width}, ${this.height})`)
			.call(xAxis);

		this.svg
			.append('text')
			.attr('transform', `translate(${(this.width / 2)}, ${this.height + 40})`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.bottom.label);

		this.svg
			.append('text')
			.attr('transform', `rotate(-90) translate(${(this.height / 2 * -1)}, 12)`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.left.label);

		//graph type line and
		const
			line = d3.svg
				.line()
				.x(d => this.x(d.x)  + this.axes.left.width)
				.y(d => this.y(d.y));

		//Appending line in chart
		this.svg.selectAll('.line-container')
			.data(this.columns)
			.enter()
			.append('g')
			.attr('class', 'line-container')
			.append('path')
			.attr('class', 'line')
			.attr('d', d => line(d))
			.style('stroke', d => d.color);

		if(this.options.showValues) {

			this.svg
				.append('g')
				.selectAll('g')
				.data(this.columns)
				.enter()
				.append('g')
				.attr('transform', column => `translate(${x1(column.name)}, 0)`)
				.selectAll('text')
				.data(column => column)
				.enter()
				.append('text')
				.attr('width', x1.rangeBand())
				.attr('fill', '#666')
				.attr('x', cell => {

					let value = Format.number(cell.y);

					if(['s'].includes(this.axes.left.format)) {
						value = d3.format('.4s')(cell.y);
					}

					return this.x(cell.x) + this.axes.left.width + (x1.rangeBand() / 2) - (value.toString().length * 4)
				})
				.text(cell => {

					if(['s'].includes(this.axes.left.format)) {
						return d3.format('.4s')(cell.y);
					}

					else {
						return Format.number(cell.y)
					}
				})
				.attr('y', cell => this.y(cell.y > 0 ? cell.y : 0) - 5)
				.attr('height', cell => Math.abs(this.y(cell.y) - this.y(0)));
		}

		// Selecting all the paths
		const path = this.svg.selectAll('path');

		if(!options.resize) {

			path[0].forEach(path => {
				var length = path.getTotalLength();

				path.style.strokeDasharray = length + ' ' + length;
				path.style.strokeDashoffset = length;
				path.getBoundingClientRect();

				path.style.transition  = `stroke-dashoffset ${Page.animationDuration}ms ease-in-out`;
				path.style.strokeDashoffset = '0';
			});
		}

		// For each line appending the circle at each point
		for(const column of this.columns) {

			this.svg.selectAll('dot')
				.data(column)
				.enter()
				.append('circle')
				.attr('class', 'clips')
				.classed('drilldown', cell => that.source.columns.get(cell.key).drilldown)
				.attr('id', (_, i) => i)
				.attr('r', 0)
				.style('fill', column.color)
				.attr('cx', d => this.x(d.x) + this.axes.left.width)
				.attr('cy', d => this.y(d.y))
				.on('mouseover', function(cell) {

					if(!that.source.columns.get(cell.key).drilldown) {
						return;
					}

					d3.select(this)
						.attr('r', 6)
						.transition()
						.duration(Page.animationDuration)
						.attr('r', 12);

					d3.select(this).classed('hover', 1);
				})
				.on('mouseout', function(cell) {

					if(!that.source.columns.get(cell.key).drilldown) {
						return;
					}

					d3.select(this)
						.transition()
						.duration(Page.animationDuration)
						.attr('r', 6);

					d3.select(this).classed('hover', 0);
				})
				.on('click', (cell, row) => {
					that.source.columns.get(cell.key).initiateDrilldown(that.rows[row]);
				});
		}

		container
		.on('mousemove.line', function() {

			container.selectAll('svg > g > circle.clips:not(.hover)').attr('r', 0);

			const
				mouse = d3.mouse(this),
				xpos = parseInt((mouse[0] - that.axes.left.width - 10) / (that.width / that.rows.length)),
				row = that.rows[xpos];

			if(!row || that.zoomRectangle) {
				return;
			}

			container.selectAll(`svg > g > circle[id='${xpos}'].clips:not(.hover)`).attr('r', 6);
		})

		.on('mouseout.line', () => container.selectAll('svg > g > circle.clips').attr('r', 0));

		path.on('mouseover', function (d) {
			d3.select(this).classed('line-hover', true);
		});

		path.on('mouseout', function (d) {
			d3.select(this).classed('line-hover', false);
		});
	}
});

Visualization.list.set('bubble', class Bubble extends LinearVisualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization', 'bubble');

		container.innerHTML = `
			<div id="visualization-${this.id}" class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>`;

		await this.source.fetch(options);

		await this.render(options);
	}

	async render(options = {}) {

		await this.draw();

		this.plot(options);
	}

	plot(options = {}) {

		super.plot(options);

		if(!this.rows || !this.rows.length) {
			return;
		}

		if(!this.bubbleColumn || !this.bubbleRadiusColumn) {
			return this.source.error('Bubble Column and Bubble Radius column cannot be empty');
		}

		const
			container = d3.selectAll(`#visualization-${this.id}`),
			that = this;

		container.on('mousemove', function() {

			const mouse = d3.mouse(this);

			if(that.zoomRectangle) {

				const
					filteredRows = [],
					width = Math.abs(mouse[0] - 10 - that.zoomRectangle.origin[0]);

				for(const row of that.rows) {

					const item = that.x(row.get(that.axes.bottom.column)) + that.axes.left.width + 10;

					if(
						(mouse[0] < that.zoomRectangle.origin[0] && item >= mouse[0] && item <= that.zoomRectangle.origin[0]) ||
						(mouse[0] >= that.zoomRectangle.origin[0] && item <= mouse[0] && item >= that.zoomRectangle.origin[0])
					) {
						filteredRows.push(row);
					}
				}

				// Assign width and height to the rectangle
				that.zoomRectangle
					.select('rect')
					.attr('x', Math.min(that.zoomRectangle.origin[0], mouse[0] - 10))
					.attr('width', width)
					.attr('height', that.height);

				that.zoomRectangle
					.select('g')
					.selectAll('*')
					.remove();

				that.zoomRectangle
					.select('g')
					.append('text')
					.text(`${Format.number(filteredRows.length)} Selected`)
					.attr('x', Math.min(that.zoomRectangle.origin[0], mouse[0]) + (width / 2))
					.attr('y', (that.height / 2) - 5);

				if(filteredRows.length) {

					that.zoomRectangle
						.select('g')
						.append('text')
						.text(`${filteredRows[0].get(that.axes.bottom.column)} - ${filteredRows[filteredRows.length - 1].get(that.axes.bottom.column)}`)
						.attr('x', Math.min(that.zoomRectangle.origin[0], mouse[0]) + (width / 2))
						.attr('y', (that.height / 2) + 20);
				}

				return;
			}
		});
		container.on('mouseleave', null);

		this.x = d3.scale.ordinal();
		this.y = d3.scale.linear().range([this.height, 20]);
		this.bubble = d3.scale.linear().range([0, 50]);

		const
			xAxis = d3.svg.axis()
				.scale(this.x)
				.orient('bottom'),

			yAxis = d3.svg.axis()
				.scale(this.y)
				.innerTickSize(-this.width)
				.orient('left');

		if(['s'].includes(this.axes.bottom.format)) {
			xAxis.tickFormat(d3.format(this.axes.left.format));
		}

		if(['s'].includes(this.axes.left.format)) {
			yAxis.tickFormat(d3.format(this.axes.left.format));
		}

		this.y.max = 0;
		this.y.min = 0;
		this.bubble.max = 0;
		this.bubble.min = 0;

		for(const row of this.rows) {

			for(const [key, value] of row) {

				if(this.axes.left.columns.some(c => c.key == key)) {
					this.y.max = Math.max(this.y.max, Math.ceil(value) || 0);
					this.y.min = Math.min(this.y.min, Math.ceil(value) || 0);
				}

				if(this.options.bubbleRadiusColumn == key) {
					this.bubble.max = Math.max(this.bubble.max, Math.ceil(value) || 0);
					this.bubble.min = Math.min(this.bubble.min, Math.ceil(value) || 0);
				}
			}
		}

		this.y.domain([this.y.min, this.y.max]);
		this.bubble.domain([this.bubble.min, this.bubble.max]);

		this.x.domain(this.rows.map(r => r.get(this.axes.bottom.column)));
		this.x.rangePoints([0, this.width], 0.1, 0);

		const
			biggestTick = this.x.domain().reduce((s, v) => s.length > v.length ? s : v, ''),
			tickNumber = Math.max(Math.floor(this.container.clientWidth / (biggestTick.length * 12)), 1),
			tickInterval = parseInt(this.x.domain().length / tickNumber),
			ticks = this.x.domain().filter((d, i) => !(i % tickInterval));

		xAxis.tickValues(ticks);

		this.svg
			.append('g')
			.attr('class', 'y scale')
			.call(yAxis)
			.attr('transform', `translate(${this.axes.left.width}, 0)`);

		this.svg
			.append('g')
			.attr('class', 'x scale')
			.attr('transform', `translate(${this.axes.left.width}, ${this.height})`)
			.call(xAxis);

		this.svg
			.append('text')
			.attr('transform', `translate(${(this.width / 2)}, ${this.height + 40})`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.bottom.label);

		this.svg
			.append('text')
			.attr('transform', `rotate(-90) translate(${(this.height / 2 * -1)}, 12)`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.left.label);

		const
			line = d3.svg
				.line()
				.x(d => this.x(d.x)  + this.axes.left.width)
				.y(d => this.y(d.y));

		// For each line appending the circle at each point
		for(const column of this.columns) {

			if(that.axes.right && column.key == that.axes.right.column) {
				continue;
			}

			let dots = this.svg
				.selectAll('dot')
				.data(column)
				.enter()
				.append('circle')
				.attr('class', 'bubble')
				.attr('id', (_, i) => i)
				.style('fill', column.color)
				.attr('cx', d => this.x(d.x) + this.axes.left.width)
				.attr('cy', d => this.y(d.y))
				.on('mousemove', function(d) {

					const mouse = d3.mouse(this);

					const tooltip = [];

					for(const [key, _] of d.row) {

						const rowColumn = d.row.source.columns.get(key);

						tooltip.push(`
							<li class="${d.row.size > 2 && that.hoverColumn && that.hoverColumn.key == key ? 'hover' : ''}">
								<span class="circle" style="background:${rowColumn.color}"></span>
								<span>
									${rowColumn.drilldown && rowColumn.drilldown.query_id ? '<i class="fas fa-angle-double-down"></i>' : ''}
									${rowColumn.name}
								</span>
								<span class="value">${d.row.get(key)}</span>
							</li>
						`);
					}

					const content = `
						<header>${d.row.get(that.bubbleColumn)}</header>
						<ul class="body">
							${tooltip.join('')}
						</ul>
					`;

					that.svg.selectAll('circle')
						.filter(v => {
							return v.row.get(that.bubbleColumn) != d.row.get(that.bubbleColumn);
						})
						.style("opacity", 0.2);

					that.svg.selectAll('text')
						.filter(x => x && x.row && x.row.get(that.bubbleColumn) != d.row.get(that.bubbleColumn))
						.attr('fill', 'grey')
						.attr('opacity', 0.2);

					if(that.container.querySelector('.loading')) {
						return;
					}

					Tooltip.show(that.container, mouse, content);
				})
				.on('mouseleave', function(d) {

					Tooltip.hide(that.container);

					that.svg.selectAll('circle')
						.style('opacity', 0.8);

					that.svg.selectAll('text')
						.attr('fill', 'black')
						.attr('opacity', 1);
				})
			;

			if(this.options.showValues != 'empty') {
				this.svg
					.selectAll('dot')
					.data(column)
					.enter()
					.append('text')
					.attr('x', d => this.x(d.x) + this.axes.left.width)
					.attr('y', d => this.y(d.y) + 6)
					.attr('text-anchor', 'middle')
					.attr('font-size', '12px')
					.text(d => d.row.get(this.options.showValues));
			}

			if(!options.resize) {

				dots = dots
					.attr('r', d => 0)
					.transition()
					.duration(Page.animationDuration)
					.ease('elastic');
			}

			dots
				.attr('r', d => this.bubble(d.row.get(that.options.bubbleRadiusColumn)) - 2);
		}
	}
});

Visualization.list.set('scatter', class Scatter extends LinearVisualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization', 'scatter');
		container.innerHTML = `
			<div id="visualization-${this.id}" class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>`;

		await this.source.fetch(options);

		await this.render(options);
	}

	async render(options = {}) {

		await this.draw();

		this.plot(options);
	}

	plot(options = {}) {

		super.plot(options);

		if(!this.rows || !this.rows.length) {
			return;
		}

		const
			container = d3.selectAll(`#visualization-${this.id}`),
			that = this;

		this.x = d3.scale.ordinal();
		this.y = d3.scale.linear().range([this.height, 20]);

		const
			xAxis = d3.svg.axis()
				.scale(this.x)
				.orient('bottom'),

			yAxis = d3.svg.axis()
				.scale(this.y)
				.innerTickSize(-this.width)
				.orient('left');

		if(['s'].includes(this.axes.bottom.format)) {
			xAxis.tickFormat(d3.format(this.axes.left.format));
		}

		if(['s'].includes(this.axes.left.format)) {
			yAxis.tickFormat(d3.format(this.axes.left.format));
		}

		let
			max = null,
			min = null;

		for(const column of this.columns) {

			for(const row of column) {

				if(max == null) {
					max = Math.ceil(row.y);
				}

				if(min == null) {
					min = Math.floor(row.y);
				}

				max = Math.max(max, Math.floor(row.y) || 0);
				min = Math.min(min, Math.ceil(row.y) || 0);
			}
		}

		this.y.domain([min, max]);
		this.x.domain(this.rows.map(r => r.get(this.axes.bottom.column)));
		this.x.rangePoints([0, this.width], 0.1, 0);

		const
			biggestTick = this.x.domain().reduce((s, v) => s.length > v.length ? s : v, ''),
			tickNumber = Math.max(Math.floor(this.container.clientWidth / (biggestTick.length * 12)), 1),
			tickInterval = parseInt(this.x.domain().length / tickNumber),
			ticks = this.x.domain().filter((d, i) => !(i % tickInterval));

		xAxis.tickValues(ticks);

		this.svg
			.append('g')
			.attr('class', 'y scale')
			.call(yAxis)
			.attr('transform', `translate(${this.axes.left.width}, 0)`);

		this.svg
			.append('g')
			.attr('class', 'x scale')
			.attr('transform', `translate(${this.axes.left.width}, ${this.height})`)
			.call(xAxis);

		this.svg
			.append('text')
			.attr('transform', `translate(${(this.width / 2)}, ${this.height + 40})`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.bottom.label);

		this.svg
			.append('text')
			.attr('transform', `rotate(-90) translate(${(this.height / 2 * -1)}, 12)`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.left.label);

		//graph type line and
		const
			line = d3.svg
				.line()
				.x(d => this.x(d.x)  + this.axes.left.width)
				.y(d => this.y(d.y));

		// For each line appending the circle at each point
		for(const column of this.columns) {

			this.svg
				.selectAll('dot')
				.data(column)
				.enter()
				.append('circle')
				.attr('class', 'clips')
				.attr('id', (_, i) => i)
				.attr('r', 3)
				.style('fill', column.color)
				.attr('cx', d => this.x(d.x) + this.axes.left.width)
				.attr('cy', d => this.y(d.y))

			if(this.options.showValues) {
				this.svg
					.selectAll('dot')
					.data(column)
					.enter()
					.append('text')
					.attr('x', d => this.x(d.x) + this.axes.left.width - ((d.x + ', ' + d.y).toString().length * 3))
					.attr('y', d => this.y(d.y) - 12)
					.text(d => d.x + ', ' + d.y);
			}
		}

		container
		.on('mousemove.line', function() {

			container.selectAll('svg > g > circle.clips').attr('r', 3);

			const
				mouse = d3.mouse(this),
				xpos = parseInt((mouse[0] - that.axes.left.width - 10) / (that.width / that.rows.length)),
				row = that.rows[xpos];

			if(!row || that.zoomRectangle) {
				return;
			}

			container.selectAll(`svg > g > circle[id='${xpos}'].clips`).attr('r', 6);
		})

		.on('mouseout.line', () => container.selectAll('svg > g > circle.clips').attr('r', 3));
	}
});

Visualization.list.set('bar', class Bar extends LinearVisualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization', 'bar');
		container.innerHTML = `
			<div id="visualization-${this.id}" class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>`;

		await this.source.fetch(options);

		await this.source.response();

		await this.render(options);
	}

	async render(options = {}) {

		await this.draw();
		this.plot(options);
	}

	plot(options = {}) {

		super.plot(options);

		if(!this.rows || !this.rows.length) {
			return;
		}

		const that = this;

		this.x = d3.scale.ordinal();
		this.y = d3.scale.linear().range([this.height, 20]);

		const
			x1 = d3.scale.ordinal(),
			xAxis = d3.svg.axis()
				.scale(this.x)
				.orient('bottom'),

			yAxis = d3.svg.axis()
				.scale(this.y)
				.innerTickSize(-this.width)
				.orient('left');

		if(['s'].includes(this.axes.bottom.format)) {
			xAxis.tickFormat(d3.format(this.axes.left.format));
		}

		if(['s'].includes(this.axes.left.format)) {
			yAxis.tickFormat(d3.format(this.axes.left.format));
		}

		let
			max = 0,
			min = 0;

		for(const column of this.columns) {

			for(const row of column) {

				if(max == null) {
					max = Math.ceil(row.y);
				}

				if(min == null) {
					min = Math.floor(row.y);
				}

				max = Math.max(max, Math.floor(row.y) || 0);
				min = Math.min(min, Math.ceil(row.y) || 0);
			}
		}

		this.y.domain([min, max]);

		this.x.domain(this.rows.map(r => r.get(this.axes.bottom.column)));
		this.x.rangeBands([0, this.width], 0.1, 0);

		const
			biggestTick = this.x.domain().reduce((s, v) => s.length > v.length ? s : v, ''),
			tickNumber = Math.max(Math.floor(this.container.clientWidth / (biggestTick.length * 12)), 1),
			tickInterval = parseInt(this.x.domain().length / tickNumber),
			ticks = this.x.domain().filter((d, i) => !(i % tickInterval));

		xAxis.tickValues(ticks);
		x1.domain(this.columns.map(c => c.name)).rangeBands([0, this.x.rangeBand()]);

		this.svg
			.append('g')
			.attr('class', 'y scale')
			.call(yAxis)
			.attr('transform', `translate(${this.axes.left.width}, 0)`);

		this.svg
			.append('g')
			.attr('class', 'x scale')
			.attr('transform', `translate(${this.axes.left.width}, ${this.height})`)
			.call(xAxis);

		this.svg
			.append('text')
			.attr('transform', `translate(${(this.width / 2)}, ${this.height + 40})`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.bottom.label);

		this.svg
			.append('text')
			.attr('transform', `rotate(-90) translate(${(this.height / 2 * -1)}, 12)`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.left.label);

		let bars = this.svg
			.append('g')
			.selectAll('g')
			.data(this.columns)
			.enter()
			.append('g')
			.style('fill', column => column.color)
			.attr('transform', column => `translate(${x1(column.name)}, 0)`)
			.selectAll('rect')
			.data(column => column)
			.enter()
			.append('rect')
			.classed('bar', true)
			.attr('width', x1.rangeBand())
			.attr('x', cell => this.x(cell.x) + this.axes.left.width)
			.on('click', function(_, row, column) {
				that.source.columns.get(that.columns[column].key).initiateDrilldown(that.rows[row]);
				d3.select(this).classed('hover', false);
			})
			.on('mouseover', function(_, __, column) {
				that.hoverColumn = that.columns[column];
				d3.select(this).classed('hover', true);
			})
			.on('mouseout', function() {
				that.hoverColumn = null;
				d3.select(this).classed('hover', false);
			});

		let values;

		if(this.options.showValues) {

			values = this.svg
				.append('g')
				.selectAll('g')
				.data(this.columns)
				.enter()
				.append('g')
				.attr('transform', column => `translate(${x1(column.name)}, 0)`)
				.selectAll('text')
				.data(column => column)
				.enter()
				.append('text')
				.attr('width', x1.rangeBand())
				.attr('fill', '#666')
				.attr('x', cell => {

					let value = Format.number(cell.y);

					if(['s'].includes(this.axes.left.format)) {
						value = d3.format('.4s')(cell.y);
					}

					return this.x(cell.x) + this.axes.left.width + (x1.rangeBand() / 2) - (value.toString().length * 4)
				})
				.text(cell => {

					if(['s'].includes(this.axes.left.format)) {
						return d3.format('.4s')(cell.y);
					}

					else
						return Format.number(cell.y)
				});
		}

		if(!options.resize) {

			bars = bars
				.attr('y', cell => this.y(0))
				.attr('height', () => 0)
				.transition()
				.delay((_, i) => (Page.animationDuration / this.x.domain().length) * i)
				.duration(Page.animationDuration)
				.ease('exp-out');

			if(values) {

				values = values
					.attr('y', cell => this.y(0))
					.attr('height', 0)
					.attr('opacity', 0)
					.transition()
					.delay((_, i) => (Page.animationDuration / this.x.domain().length) * i)
					.duration(Page.animationDuration)
					.ease('exp-out');
			}
		}

		bars
			.attr('y', cell => this.y(cell.y > 0 ? cell.y : 0))
			.attr('height', cell => Math.abs(this.y(cell.y) - this.y(0)));

		if(values) {

			values
				.attr('y', cell => this.y(cell.y > 0 ? cell.y : 0) - 3)
				.attr('height', cell => Math.abs(this.y(cell.y) - this.y(0)))
				.attr('opacity', 1);
		}
	}
});

Visualization.list.set('linear', class Linear extends LinearVisualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization', 'linear');
		container.innerHTML = `
			<div id="visualization-${this.id}" class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>`;

		await this.source.fetch(options);

		await this.render(options);
	}

	constructor(visualization, source) {

		super(visualization, source);

		if(!this.axes) {
			this.axes = [];
		}

		this.axes = this.axes.sort((a, b) => b.depth - a.depth);
		this.axes = this.axes.sort((a, b) => ['top', 'bottom'].includes(a.position) ? -1 : 1);

		this.axes.top = {
			size: 0,
		};
		this.axes.right = {
			size: 0,
		};
		this.axes.bottom = {
			size: 0,
		};
		this.axes.left = {
			size: 0,
		};

		for(const axis of this.axes || []) {
			axis.size = 0;
			this.axes[axis.position] = axis;
			axis.column = axis.columns.length ? axis.columns[0].key : '';
		}
	}

	async render(options = {}) {

		await this.draw();
		await this.plot(options);
	}

	async draw() {

		const rows = await this.source.response();

		if(!rows || !rows.length) {
			return this.source.error();
		}

		this.rows = rows;

		this.zoomedIn = false;

		for(const axis of this.axes) {

			if(!axis.restcolumns) {
				continue;
			}

			axis.columns = [];

			for(const [key, column] of this.source.columns) {

				if(!column.disabled && !column.hidden && !this.axes.some(a => a.columns.some(c => c.key == key))) {
					axis.columns.push({key});
				}
			}

			axis.column = axis.columns.length ? axis.columns[0].key : '';
		}

		outer:
		for(const [key, column] of this.source.columns) {

			for(const axis of this.axes) {
				if(axis.columns.some(c => c.key == key)) {
					continue outer;
				}
			}
		}

		for(const axis of this.axes) {
			this.axes[axis.position].size = 0;
		}

		for(const axis of this.axes) {

			const columns = axis.columns.filter(column => this.source.columns.has(column.key) && !this.source.columns.get(column.key).disabled);

			if(!columns.length) {
				continue;
			}

			this.axes[axis.position].size += axis.position == 'left' ? 50 : axis.top == 'top' ? 20 : 30;

			if(axis.label) {
				this.axes[axis.position].size += 20;
			}

			if(axis.rotateTicks && ['top', 'bottom'].includes(axis.position) && !this.options.hideScales && !axis.hideScale) {
				this.axes[axis.position].size += (isNaN(parseInt(axis.maxTickLength)) ? 15 : parseInt(axis.maxTickLength)) * 5;
			}
		}

		this.height = this.container.clientHeight - this.axes.top.size - this.axes.bottom.size - 20;
		this.width = this.container.clientWidth - this.axes.left.size - this.axes.right.size - 40;

		window.addEventListener('resize', () => {

			const
				height = this.container.clientHeight - this.axes.top.size - this.axes.bottom.size - 20,
				width = this.container.clientWidth - this.axes.left.size - this.axes.right.size - 40;

			if(this.width != width || this.height != height) {

				this.width = width;
				this.height = height;

				this.plot({resize: true});
			}
		});
	}

	async plot(options = {})  {

		const container = d3.selectAll(`#visualization-${this.id}`);

		container.selectAll('*').remove();

		if(!this.rows || !this.rows.length) {
			return;
		}

		this.svg = container
			.append('svg');

		if(this.zoomedIn) {

			// Reset Zoom Button
			const resetZoom = this.svg.append('g')
				.attr('class', 'reset-zoom')
				.attr('y', 0)
				.attr('x', (this.width / 2) - 35);

			resetZoom.append('rect')
				.attr('width', 80)
				.attr('height', 20)
				.attr('y', 0)
				.attr('x', (this.width / 2) - 35);

			resetZoom.append('text')
				.attr('y', 15)
				.attr('x', (this.width / 2) - 35 + 40)
				.attr('text-anchor', 'middle')
				.style('font-size', '12px')
				.text('Reset Zoom');

			// Click on reset zoom function
			resetZoom.on('click', async () => {
				this.rows = that.rowsMaster
				this.zoomedIn = false;
				this.plot();
			});
		}

		const that = this;

		for(const [axisIndex, axis] of this.axes.entries()) {

			const columns = axis.columns.filter(column => this.source.columns.has(column.key) && !this.source.columns.get(column.key).disabled);

			if(!columns.length) {
				continue;
			}

			axis.animate = !options.resize && !axis.dontAnimate && !this.options.dontAnimate;

			let maxTickLength = parseInt(axis.maxTickLength);

			if(axis.rotateTicks && isNaN(maxTickLength))
				maxTickLength = 15;

			if(['top', 'bottom'].includes(axis.position)) {

				const
					scale = d3.scale.ordinal(),
					column = [];

				let biggestTick = 0;

				for(const row of this.rows) {

					let value = row.getTypedValue(columns[0].key);

					column.push(value);

					if(biggestTick < value.length) {
						biggestTick = value.length;
					}
				}

				if(!isNaN(maxTickLength)) {
					biggestTick = Math.min(maxTickLength, biggestTick);
				}

				if(axis.rotateTicks) {
					biggestTick = 3;
				}

				scale.domain(column);

				scale.rangeBands([0, this.width], 0.1, 0);

				// Add the axis scale
				if(!this.options.hideScales && !axis.hideScale) {

					const
						tickNumber = Math.max(Math.floor(this.container.clientWidth / (biggestTick * 12)), 1),
						tickInterval = parseInt(this.rows.length / tickNumber),
						ticks = [],
						d3Axis = d3.svg.axis()
							.scale(scale)
							.orient(axis.position);

					for(let i = 0; i < column.length; i++) {

						if(!(i % tickInterval)) {
							ticks.push(column[i]);
						}
					}

					d3Axis
						.tickValues(ticks)
						.tickFormat(d => {

							if(maxTickLength < d.length) {
								return d.substring(0, maxTickLength) + '\u2026';
							}

							return d;
						});

					const g = this.svg
						.append('g')
						.attr('class', 'scale ' + axis.position)
						.call(d3Axis);

					if(axis.position == 'bottom') {
						g.attr('transform', `translate(${this.axes.left.size}, ${this.height})`);
					}
					else {
						g.attr('transform', `translate(${this.axes.left.size}, ${axis.label ? 45 : 20})`);
					}

					if(axis.rotateTicks) {

						const t = g
							.selectAll('text')
							.attr('transform', `rotate(-65)`)
							.style('text-anchor', 'end');
					}
				}

				if(axis.label) {

					const text = this.svg
						.append('text')
						.attr('class', 'axis-label')
						.style('text-anchor', 'middle')
						.text(axis.label);

					if(axis.position == 'bottom') {

						let top = 0;

						if(axis.rotateTicks) {
							top = (isNaN(parseInt(axis.maxTickLength)) ? 15 : parseInt(axis.maxTickLength)) * 5;
						}

						text.attr('transform', `translate(${(this.width / 2)}, ${this.height + top + 45})`)
					}
					else {
						text.attr('transform', `translate(${(this.width / 2)}, 10)`)
					}
				}

				this.x = scale;

				Object.assign(this.x, axis);

				this.x.column = columns[0].key;
				continue;
			}

			if(!this.x) {
				continue;
			}

			const scale = d3.scale.linear().range([this.height, 20]);

			let columnsData = [];

			for(const _column of columns) {

				const column = [];

				Object.assign(column, _column);

				for(const [index, row] of this.rows.entries()) {

					column.push({
						x: index,
						y: parseFloat(row.get(column.key)),
					});
				}

				columnsData.push(column);
			}

			if(axis.contribution) {

				const rowsTotals = [];

				for(const [index, row] of columnsData[0].entries()) {

					rowsTotals[index] = 0;

					for(const column of columnsData) {
						rowsTotals[index] += column[index].y;
					}
				}

				for(const column of columnsData.values()) {

					for(const [index, row] of column.entries()) {
						row.y = row.y / rowsTotals[index] * 100;
					}
				}
			}

			if(axis.stacked) {
				columnsData = d3.layout.stack()(columnsData);
			}

			// Needed to show multiple columns
			columns.scale = d3.scale.ordinal();
			columns.scale.domain(columns.map(column => column.key));
			columns.scale.rangeBands([0, this.x.rangeBand()]);

			let
				max = 0,
				min = 0;

			for(const row of this.rows) {

				let total = 0;

				for(const column of columns) {

					total += parseFloat(row.get(column.key)) || 0;
					max = Math.max(max, Math.ceil(row.get(column.key)) || 0);
					min = Math.min(min, Math.floor(row.get(column.key)) || 0);
				}

				if(axis.stacked) {
					max = Math.max(max, Math.ceil(total) || 0);
				}
			}

			let maxMin = [min, max];

			if(axis.contribution) {
				maxMin = [0, 100];
			}

			if(this.x.position == 'top') {
				maxMin = [maxMin[1], maxMin[0]];
			}

			scale.domain(maxMin).nice();

			if(axis.type == 'line') {

				const
					line = d3.svg.line()
						.interpolate(axis.curve || 'linear')
						.x((_, i) => this.x(this.rows[i].getTypedValue(this.x.column)) + this.axes.left.size + (this.x.rangeBand() / 2))
						.y(d => scale(d.y + (d.y0 || 0)));

				// Appending line in chart
				this.svg.selectAll('.line-' + axisIndex)
					.data(columnsData)
					.enter()
					.append('g')
					.attr('class', `${axis.type} ${axis.position} line-${axisIndex}`)
					.append('path')
					.attr('class', 'line')
					.attr('d', column => line(column))
					.style('stroke', column => this.source.columns.get(column.key).color)
					.style('stroke-width', axis.lineThickness || 2);

				if(axis.animate) {

					for(const path of this.svg.selectAll('path')[0]) {

						const length = path.getTotalLength();

						path.style.strokeDasharray = `${length} ${length}`;
						path.style.strokeDashoffset = length;
						path.getBoundingClientRect();

						path.style.transition  = `stroke-dashoffset ${Page.animationDuration}ms ease-out`;
						path.style.strokeDashoffset = '0';
					}
				}
			}

			else if(axis.type == 'bar') {

				let bars = this.svg
					.append('g')
					.attr('class', `${axis.type} ${axis.position}`)
					.selectAll('g')
					.data(columnsData)
					.enter()
					.append('g')
					.style('fill', (column, i) => this.source.columns.get(columns[i].key).color)
					.attr('transform', column => axis.stacked ? `translate(0, ${this.axes.top.size})` : `translate(${columns.scale(column.key)}, 0)`)
					.selectAll('rect')
					.data(column => column)
					.enter()
					.append('rect')
					.on('click', function(_, row, column) {
						that.source.columns.get(columns[column].key).initiateDrilldown(that.rows[row]);
						d3.select(this).classed('hover', false);
					})
					.on('mouseover', function(_, __, column) {
						that.hoverColumn = columns[column];
						d3.select(this).classed('hover', true);
					})
					.on('mouseout', function() {
						that.hoverColumn = null;
						d3.select(this).classed('hover', false);
					})
					.attr('width', axis.stacked ? this.x.rangeBand() : columns.scale.rangeBand())
					.attr('x', (cell, i) => this.x(this.rows[i].getTypedValue(this.x.column)) + this.axes.left.size);

				if(axis.animate) {

					bars = bars
						.attr('y', _ => scale(0))
						.attr('height', 0)
						.transition()
						.delay((_, i) => (Page.animationDuration / this.rows.length) * i)
						.duration(Page.animationDuration)
						.ease('exp-out');
				}

				bars
					.attr('y', d => this.x.position == 'top' ? this.axes.top.size : scale((d.y + (d.y0 || 0)) > 0 ? d.y + (d.y0 || 0) : 0))
					.attr('height', d => Math.abs(axis.stacked ? this.height - scale(d.y) : scale(d.y) - scale(d.y0 || 0)));
			}

			else if(axis.type == 'area') {

				this.x.rangePoints([0, this.width], 0.1, 0);

				const area = d3.svg.area()
					.interpolate(axis.curve)
					.x((data, i) => this.x(this.rows[i].getTypedValue(this.x.column)))
					.y0(d => scale(axis.stacked ? d.y0 : 0))
					.y1(d => scale(d.y + (d.y0 || 0)));

				let areas = this.svg
					.append('g')
					.attr('class', `${axis.type} ${axis.position}`)
					.selectAll('g')
					.data(columnsData)
					.enter()
					.append('g')
					.append('path')
					.attr('transform', `translate(${this.axes.left.size}, 0)`)
					.on('mouseover', function(column) {
						that.hoverColumn = column;
						d3.select(this).classed('hover', true);
					})
					.on('mouseout', function() {
						that.hoverColumn = null;
						d3.select(this).classed('hover', false);
					})
					.attr('d', column => area(column))
					.style('fill', (column, i) => this.source.columns.get(columns[i].key).color);

				if(!options.resize) {

					areas = areas
						.attr('opacity', 0)
						.transition()
						.duration(Page.animationDuration)
						.ease('exp-out');
				}

				areas.attr('opacity', 0.8);

				this.x.rangeBands([0, this.width], 0.1, 0);
			}

			// Append the axis scale
			if(!this.options.hideScales && !axis.hideScale) {

				const d3Axis = d3.svg.axis()
					.scale(scale)
					.innerTickSize(this.width * (axis.position == 'right' ? 1 : -1))
					.orient(axis.position == 'right' ? 'right' : 'left');

				d3Axis.tickFormat(d => {

					if(['s'].includes(axis.format)) {
						d = d3.format(axis.format)(d);
					}

					if(!isNaN(maxTickLength) && maxTickLength < d.toString().length) {
						d = d.toString().substring(0, maxTickLength) + '\u2026';
					}

					return d;
				});

				this.svg
					.append('g')
					.attr('class', 'scale ' + axis.position)
					.classed('hide-scale-lines', this.options.hideScaleLines || axis.hideScaleLines)
					.call(d3Axis)
					.attr('transform', `translate(${this.axes.left.size}, 0)`);
			}

			if(axis.label) {

				const text = this.svg
					.append('text')
					.attr('class', 'axis-label')
					.style('text-anchor', 'middle')
					.text(axis.label);

				if(axis.position == 'right') {
					text.attr('transform', `rotate(90) translate(${(this.height / 2)}, ${(this.axes.left.size + this.width + 50) * -1})`);
				}
				else {
					text.attr('transform', `rotate(-90) translate(${(this.height / 2 * -1)}, 12)`);
				}
			}

			for(const [i, column] of columns.entries()) {

				column.dots = this.svg.selectAll('dot')
					.data(columnsData[i])
					.enter()
					.append('circle')
					.attr('class', 'dot')
					.style('fill', this.source.columns.get(column.key).color)
					.attr('cx', (_, i) => this.x(this.rows[i].getTypedValue(this.x.column)) + this.axes.left.size + (this.x.rangeBand() / 2))
					.attr('cy', row => scale(row.y + (row.y0 || 0)));

				if(axis.animate) {

					column.dots = column.dots
						.attr('r', 0)
						.transition()
						.delay((_, i) => (Page.animationDuration / this.x.domain().length) * i)
						.duration(0)
						.ease('exp-out');
				}
			}

			// For each line appending the circle at each point
			if(this.options.showPoints || axis.showPoints) {

				for(const [i, column] of columns.entries()) {
					column.dots.attr('r', 3);
				}
			}

			// Show the value of each point in the graph itself
			if(this.options.showValues || axis.showValues) {

				let points = this.svg
					.append('g')
					.selectAll('g')
					.data(columns)
					.enter()
					.append('g')
					.selectAll('text')
					.data(column => this.rows.map(row => [row, column]))
					.enter()
					.append('text')
					.attr('width', columns.scale.rangeBand())
					.attr('fill', 'var(--color-surface-text)')
					.text(([row, column]) => {

						if(['s'].includes(axis.format)) {
							return d3.format('.4s')(row.getTypedValue(column.key));
						}

						else {
							return row.getTypedValue(column.key);
						}
					})
					.attr('x', ([row, column]) => {

						let value = row.getTypedValue(column.key);

						if(['s'].includes(axis.format)) {
							value = d3.format('.4s')(value);
						}

						return this.x(row.getTypedValue(this.x.column)) + this.axes.left.size + (columns.scale.rangeBand() / 2) - (value.toString().length * 4)
					})
					.attr('y', ([row, column], i, j) => scale((columnsData[j][i].y > 0 ? columnsData[j][i].y : 0) + (columnsData[j][i].y0 || 0)) - (5 * (this.x.position == 'top' ? -5 : 2)))
					.attr('height', ([row, column]) => Math.abs(scale(row.getTypedValue(column.key)) - scale(0)));

				if(axis.animate) {

					points = points
						.attr('opacity', 0)
						.transition()
						.delay((_, i) => (Page.animationDuration / this.x.domain().length) * i)
						.duration(0)
						.ease('exp-out');
				}

				points.attr('opacity', 1);
			}

		}

		for(const g of this.svg.selectAll('svg > g')[0] || [])  {

			if(g.classList.contains('scale')) {
				g.parentElement.insertBefore(g, g.parentElement.firstChild);
			}
		}

		container

		.on('mousemove', () => {

			const mouse = d3.mouse(container[0][0]);

			if(this.zoomRectangle) {

				const
					filteredRows = this.rows.filter(row => {

						const item = this.x(row.getTypedValue(this.x.column)) + 100;

						if(mouse[0] < this.zoomRectangle.origin[0]) {
							return item >= mouse[0] && item <= this.zoomRectangle.origin[0];
						}
						else {
							return item <= mouse[0] && item >= this.zoomRectangle.origin[0];
						}
					}),
					width = Math.abs(mouse[0] - this.zoomRectangle.origin[0]);

				// Assign width and height to the rectangle
				this.zoomRectangle
					.select('rect')
					.attr('x', Math.min(this.zoomRectangle.origin[0], mouse[0]))
					.attr('width', width)
					.attr('height', this.height);

				this.zoomRectangle
					.select('g')
					.selectAll('*')
					.remove();

				this.zoomRectangle
					.select('g')
					.append('text')
					.text(`${Format.number(filteredRows.length)} Selected`)
					.attr('x', Math.min(this.zoomRectangle.origin[0], mouse[0]) + (width / 2))
					.attr('y', (this.height / 2) - 5);

				if(filteredRows.length) {

					this.zoomRectangle
						.select('g')
						.append('text')
						.attr('class', 'range')
						.html(`${filteredRows[0].getTypedValue(this.x.column)} &hellip; ${filteredRows[filteredRows.length - 1].getTypedValue(this.x.column)}`)
						.attr('x', Math.min(this.zoomRectangle.origin[0], mouse[0]) + (width / 2))
						.attr('y', (this.height / 2) + 20);
				}

				return;
			}

			const
				rowPosition = parseInt((mouse[0] - this.axes.left.size - 10) / (this.width / this.rows.length)),
				row = this.rows[rowPosition];

			if(!row || !this.x) {
				return;
			}

			for(const axis of this.axes) {

				// Only works in line for now
				if(!['line'].includes(axis.type)) {
					continue;
				}

				const columns = axis.columns.filter(column => this.source.columns.has(column.key) && !this.source.columns.get(column.key).disabled);

				if(!columns.length) {
					continue;
				}

				for(const column of columns) {

					if(!column.dots || !column.dots.length) {
						continue;
					}

					for(const [i, dot] of column.dots[0].entries()) {

						let
							radius = 0,
							hover = false;

						if(this.options.showPoints || axis.showPoints) {
							radius = 3;
						}

						if(i == rowPosition) {
							radius = 5;
							hover = true;
						}

						dot.setAttribute('r', radius);
						dot.classList.toggle('hover', hover);
						dot.dataset.showPoints = this.options.showPoints || axis.showPoints;
					}
				}
			}

			const tooltip = [];

			for(const [key, _] of row) {

				if(key == this.x.column) {
					continue;
				}

				const column = row.source.columns.get(key);

				if(column.disabled || column.hidden) {
					continue;
				}

				tooltip.push(`
					<li class="${row.size > 2 && this.hoverColumn && this.hoverColumn.key == key ? 'hover' : ''}">
						<span class="circle" style="background:${column.color}"></span>
						<span>
							${column.drilldown && column.drilldown.query_id ? '<i class="fas fa-angle-double-down"></i>' : ''}
							${column.name}
						</span>
						<span class="value">${row.getTypedValue(key)}</span>
					</li>
				`);
			}

			const content = `
				<header>${row.getTypedValue(this.x.column)}</header>
				<ul class="body">
					${tooltip.reverse().join('')}
				</ul>
			`;

			if(this.container.querySelector('.loading')) {
				return;
			}

			Tooltip.show(this.container, mouse, content, row);
		})

		.on('mouseleave', function() {

			Tooltip.hide(that.container);

			// Reset any dots that have hover radius
			const dots = that.container.querySelectorAll('.dot.hover');

			for(const dot of dots) {

				dot.classList.remove('hover');
				dot.setAttribute('r', dot.dataset.showPoints == 'true' ? 3 : 0);
			}
		})

		.on('mousedown', function() {

			Tooltip.hide(that.container);

			if(that.zoomRectangle) {
				return;
			}

			that.zoomRectangle = container.select('svg').append('g');

			that.zoomRectangle
				.style('text-anchor', 'middle')
				.append('rect')
				.attr('class', 'zoom-rectangle');

			that.zoomRectangle
				.append('g')
				.attr('class', 'zoom-rectangle-text');

			that.zoomRectangle.origin = d3.mouse(this);
		})

		.on('mouseup', function() {

			if(!that.zoomRectangle) {
				return;
			}

			that.zoomRectangle.remove();

			const
				mouse = d3.mouse(this),
				filteredRows = that.rows.filter(row => {

					const item = that.x(row.getTypedValue(that.x.column)) + 100;

					if(mouse[0] < that.zoomRectangle.origin[0]) {
						return item >= mouse[0] && item <= that.zoomRectangle.origin[0];
					}
					else {
						return item <= mouse[0] && item >= that.zoomRectangle.origin[0];
					}
				});

			that.zoomRectangle = null;

			if(!filteredRows.length) {
				return;
			}

			if(!that.zoomedIn) {
				that.rowsMaster = that.rows;
			}

			that.rows = filteredRows;
			that.zoomedIn = true;

			that.plot();
		}, true);;
	}
});

Visualization.list.set('dualaxisbar', class DualAxisBar extends LinearVisualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization', 'dualaxisbar');
		container.innerHTML = `
			<div id="visualization-${this.id}" class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>`;

		await this.source.fetch(options);

		await this.render(options);
	}

	constructor(visualization, source) {

		super(visualization, source);

		for(const axis of this.axes || []) {
			this.axes[axis.position] = axis;
			axis.column = axis.columns.length ? axis.columns[0].key : '';
		}
	}

	async draw() {

		const rows = await this.source.response();

		if(!rows || !rows.length) {
			return this.source.error();
		}

		if(!this.axes) {
			return this.source.error('Axes not defined.');
		}

		if(!this.axes.bottom) {
			return this.source.error('Bottom axis not defined.');
		}

		if(!this.axes.left) {
			return this.source.error('Left axis not defined.');
		}

		if(!this.axes.right) {
			return this.source.error('Right axis not defined.');
		}

		if(!this.axes.bottom.columns.length) {
			return this.source.error('Bottom axis requires exactly one column.');
		}

		if(!this.axes.left.columns.length) {
			return this.source.error('Left axis requires atleast one column.');
		}

		if(!this.axes.right.columns.length) {
			return this.source.error('Right axis requires atleast one column.');
		}

		if(this.axes.bottom.columns.length > 1) {
			return this.source.error('Bottom axis cannot has more than one column.');
		}

		for(const column of this.axes.bottom.columns) {
			if(!this.source.columns.get(column.key)) {
				return this.source.error(`Bottom axis column <em>${column.key}</em> not found.)`);
			}
		}

		for(const column of this.axes.left.columns) {
			if(!this.source.columns.get(column.key)) {
				return this.source.error(`Left axis column <em>${column.key}</em> not found.`);
			}
		}

		for(const column of this.axes.right.columns) {
			if(!this.source.columns.get(column.key)) {
				return this.source.error(`Right axis column <em>${column.key}</em> not found.`);
			}
		}

		for(const bottom of this.axes.bottom.columns) {

			for(const left of this.axes.left.columns) {

				if(bottom.key == left.key) {
					return this.source.error(`Column <em>${bottom.key}</em> cannot be on two axis.`);
				}
			}

			for(const right of this.axes.right.columns) {

				if(bottom.key == right.key) {
					return this.source.error(`Column <em>${bottom.key}</em> cannot be on two axis.`);
				}
			}
		}

		if(this.axes.bottom.columns.every(c => this.source.columns.get(c.key).disabled)) {
			return this.source.error('Bottom axis requires atleast one column.');
		}

		if(this.axes.left.columns.every(c => this.source.columns.get(c.key).disabled)) {
			return this.source.error('Left axis requires atleast one column.');
		}

		if(this.axes.right.columns.every(c => this.source.columns.get(c.key).disabled)) {
			return this.source.error('Right axis requires atleast one column.');
		}

		for(const [key, column] of this.source.columns) {

			if(this.axes.left.columns.some(c => c.key == key) || this.axes.right.columns.some(c => c.key == key) || this.axes.bottom.columns.some(c => c.key == key)) {
				continue;
			}

			column.hidden = true;
			column.disabled = true;
			column.render();
		}

		this.rows = rows;

		this.axes.bottom.height = 25;
		this.axes.left.width = 40;
		this.axes.right.width = 25;

		if(this.axes.bottom.label) {
			this.axes.bottom.height += 20;
		}

		if(this.axes.left.label) {
			this.axes.left.width += 20;
		}

		if(this.axes.right.label) {
			this.axes.right.width += 10;
		}

		this.height = this.container.clientHeight - this.axes.bottom.height - 20;
		this.width = this.container.clientWidth - this.axes.left.width - this.axes.right.width - 40;

		window.addEventListener('resize', () => {

			const
				height = this.container.clientHeight - this.axes.bottom.height - 20,
				width = this.container.clientWidth - this.axes.left.width - this.axes.right.width - 40;

			if(this.width != width || this.height != height) {

				this.width = width;
				this.height = height;

				this.plot({resize: true});
			}
		});
	}

	async render(options = {}) {

		await this.draw();
		await this.plot(options);
	}

	async plot(options = {})  {

		const container = d3.selectAll(`#visualization-${this.id}`);

		container.selectAll('*').remove();

		if(!this.rows || !this.rows.length) {
			return;
		}

		this.columns = {
			left: {},
			right: {},
		};

		for(const row of this.rows) {

			for(const [key, value] of row) {

				if(key == this.axes.bottom.column) {
					continue;
				}

				const column = this.source.columns.get(key);

				if(!column || column.disabled) {
					continue;
				}

				let direction = null;

				if(this.axes.left.columns.some(c => c.key == key)) {
					direction = 'left';
				}

				if(this.axes.right.columns.some(c => c.key == key)) {
					direction = 'right';
				}

				if(!direction) {
					continue;
				}

				if(!this.columns[direction][key]) {
					this.columns[direction][key] = [];
					Object.assign(this.columns[direction][key], column);
				}

				this.columns[direction][key].push({
					x: row.get(this.axes.bottom.column),
					y: value,
					key,
				});
			}
		}

		this.columns.left = Object.values(this.columns.left);
		this.columns.right = Object.values(this.columns.right);

		this.svg = container
			.append('svg')
			.append('g')
			.attr('class', 'chart');

		if(!this.rows.length) {
			return this.source.error();
		}

		if(this.rows.length != (await this.source.response()).length) {

			// Reset Zoom Button
			const resetZoom = this.svg.append('g')
				.attr('class', 'reset-zoom')
				.attr('y', 0)
				.attr('x', (this.width / 2) - 35);

			resetZoom.append('rect')
				.attr('width', 80)
				.attr('height', 20)
				.attr('y', 0)
				.attr('x', (this.width / 2) - 35);

			resetZoom.append('text')
				.attr('y', 15)
				.attr('x', (this.width / 2) - 35 + 40)
				.attr('text-anchor', 'middle')
				.style('font-size', '12px')
				.text('Reset Zoom');

			// Click on reset zoom function
			resetZoom.on('click', async () => {
				this.rows = await this.source.response();
				this.plot();
			});
		}

		if(!this.rows.length) {
			return;
		}

		const that = this;

		this.bottom = d3.scale.ordinal();
		this.left = d3.scale.linear().range([this.height, 20]);
		this.right = d3.scale.linear().range([this.height, 20]);

		const
			x1 = d3.scale.ordinal(),
			bottomAxis = d3.svg.axis()
				.scale(this.bottom)
				.orient('bottom'),

			leftAxis = d3.svg.axis()
				.scale(this.left)
				.innerTickSize(-this.width)
				.tickFormat(d3.format('s'))
				.orient('left'),

			rightAxis = d3.svg.axis()
				.scale(this.right)
				.innerTickSize(this.width)
				.tickFormat(d3.format('s'))
				.orient('right');

		this.left.max = 0;
		this.right.max = 0;

		for(const row of this.rows) {

			for(const [key, value] of row) {

				if(this.axes.left.columns.some(c => c.key == key)) {
					this.left.max = Math.max(this.left.max, Math.ceil(value) || 0);
				}

				if(this.axes.right.columns.some(c => c.key == key)) {
					this.right.max = Math.max(this.right.max, Math.ceil(value) || 0);
				}
			}
		}

		this.left.domain([0, this.left.max]);
		this.right.domain([0, this.right.max]);

		this.bottom.domain(this.rows.map(r => r.get(this.axes.bottom.column)));
		this.bottom.rangeBands([0, this.width], 0.1, 0);

		const
			biggestTick = this.bottom.domain().reduce((s, v) => s.length > v.length ? s : v, ''),
			tickNumber = Math.max(Math.floor(this.container.clientWidth / (biggestTick.length * 12)), 1),
			tickInterval = parseInt(this.bottom.domain().length / tickNumber),
			ticks = this.bottom.domain().filter((d, i) => !(i % tickInterval));

		bottomAxis.tickValues(ticks);
		x1.domain(this.columns.left.map(c => c.name)).rangeBands([0, this.bottom.rangeBand()]);

		this.svg
			.append('g')
			.attr('class', 'x scale')
			.attr('transform', `translate(${this.axes.left.width}, ${this.height})`)
			.call(bottomAxis);

		this.svg
			.append('g')
			.attr('class', 'y scale')
			.call(leftAxis)
			.attr('transform', `translate(${this.axes.left.width}, 0)`);

		this.svg
			.append('g')
			.attr('class', 'y scale')
			.call(rightAxis)
			.attr('transform', `translate(${this.axes.left.width}, 0)`);

		this.svg
			.append('text')
			.attr('transform', `translate(${(this.width / 2)}, ${this.height + 40})`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.bottom.label);

		this.svg
			.append('text')
			.attr('transform', `rotate(-90) translate(${(this.height / 2 * -1)}, 12)`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.left.label);

		this.svg
			.append('text')
			.attr('transform', `rotate(90) translate(${(this.height / 2)}, ${(this.axes.left.width + this.width + 40) * -1})`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.right.label);

		let bars = this.svg
			.append('g')
			.selectAll('g')
			.data(this.columns.left)
			.enter()
			.append('g')
			.style('fill', column => column.color)
			.attr('transform', column => `translate(${x1(column.name)}, 0)`)
			.selectAll('rect')
			.data(column => column)
			.enter()
			.append('rect')
			.classed('bar', true)
			.attr('width', x1.rangeBand())
			.attr('x', cell => this.bottom(cell.x) + this.axes.left.width)
			.on('click', function(_, row, column) {
				that.source.columns.get(that.columns.left[column].key).initiateDrilldown(that.rows[row]);
				d3.select(this).classed('hover', false);
			})
			.on('mouseover', function(_, __, column) {
				that.hoverColumn = that.columns.left[column];
				d3.select(this).classed('hover', true);
			})
			.on('mouseout', function() {
				that.hoverColumn = null;
				d3.select(this).classed('hover', false);
			});

		if(!options.resize) {

			bars = bars
				.attr('height', () => 0)
				.attr('y', () => this.height)
				.transition()
				.delay((_, i) => (Page.animationDuration / this.bottom.domain().length) * i)
				.duration(Page.animationDuration)
				.ease('exp-out');
		}

		bars
			.attr('height', cell => this.height - this.left(cell.y))
			.attr('y', cell => this.left(cell.y));

		//graph type line and
		const
			line = d3.svg
				.line()
				.x(d => this.bottom(d.x)  + this.axes.left.width + (this.bottom.rangeBand() / 2))
				.y(d => this.right(d.y));

		//Appending line in chart
		this.svg.selectAll('.city')
			.data(this.columns.right)
			.enter()
			.append('g')
			.attr('class', 'city')
			.append('path')
			.attr('class', 'line')
			.attr('d', d => line(d))
			.style('stroke', d => d.color);

		// Selecting all the paths
		const path = this.svg.selectAll('path');

		if(!options.resize) {

			path[0].forEach(path => {

				var length = path.getTotalLength();

				path.style.strokeDasharray = length + ' ' + length;
				path.style.strokeDashoffset = length;
				path.getBoundingClientRect();

				path.style.transition  = `stroke-dashoffset ${Page.animationDuration}ms ease-out`;
				path.style.strokeDashoffset = '0';
			});
		}

		// For each line appending the circle at each point
		for(const column of this.columns.right) {

			let dots = this.svg.selectAll('dot')
				.data(column)
				.enter()
				.append('circle')
				.attr('class', 'clips')
				.style('fill', column.color)
				.attr('cx', d => this.bottom(d.x) + this.axes.left.width + (this.bottom.rangeBand() / 2))
				.attr('cy', d => this.right(d.y));

			if(!options.resize) {

				dots = dots
					.attr('r', 0)
					.transition()
					.delay((_, i) => (Page.animationDuration / this.bottom.domain().length) * i)
					.duration(0)
					.ease('exp-out');
			}

			dots.attr('r', 5);
		}

		this.zoomRectangle = null;

		container

		.on('mousemove', function() {

			const mouse = d3.mouse(this);

			if(that.zoomRectangle) {

				const
					filteredRows = that.rows.filter(row => {

						const item = that.bottom(row.get(that.axes.bottom.column)) + 100;

						if(mouse[0] < that.zoomRectangle.origin[0]) {
							return item >= mouse[0] && item <= that.zoomRectangle.origin[0];
						}
						else {
							return item <= mouse[0] && item >= that.zoomRectangle.origin[0];
						}
					}),
					width = Math.abs(mouse[0] - that.zoomRectangle.origin[0]);

				// Assign width and height to the rectangle
				that.zoomRectangle
					.select('rect')
					.attr('x', Math.min(that.zoomRectangle.origin[0], mouse[0]))
					.attr('width', width)
					.attr('height', that.height);

				that.zoomRectangle
					.select('g')
					.selectAll('*')
					.remove();

				that.zoomRectangle
					.select('g')
					.append('text')
					.text(`${Format.number(filteredRows.length)} Selected`)
					.attr('x', Math.min(that.zoomRectangle.origin[0], mouse[0]) + (width / 2))
					.attr('y', (that.height / 2) - 5);

				if(filteredRows.length) {

					that.zoomRectangle
						.select('g')
						.append('text')
						.text(`${filteredRows[0].get(that.axes.bottom.column)} - ${filteredRows[filteredRows.length - 1].get(that.axes.bottom.column)}`)
						.attr('x', Math.min(that.zoomRectangle.origin[0], mouse[0]) + (width / 2))
						.attr('y', (that.height / 2) + 20);
				}

				return;
			}

			const row = that.rows[parseInt((mouse[0] - that.axes.left.width - 10) / (that.width / that.rows.length))];

			if(!row) {
				return;
			}

			const tooltip = [];

			for(const [key, value] of row) {

				if(key == that.axes.bottom.column) {
					continue;
				}

				tooltip.push(`
					<li class="${row.size > 2 && that.hoverColumn && that.hoverColumn.key == key ? 'hover' : ''}">
						<span class="circle" style="background:${row.source.columns.get(key).color}"></span>
						<span>${row.source.columns.get(key).name}</span>
						<span class="value">${Format.number(value)}</span>
					</li>
				`);
			}

			const content = `
				<header>${row.get(that.axes.bottom.column)}</header>
				<ul class="body">
					${tooltip.reverse().join('')}
				</ul>
			`;

			if(that.container.querySelector('.loading')) {
				return;
			}

			Tooltip.show(that.container, mouse, content, row);
		})

		.on('mouseleave', function() {
			Tooltip.hide(that.container);
		})

		.on('mousedown', function() {

			Tooltip.hide(that.container);

			if(that.zoomRectangle) {
				return;
			}

			that.zoomRectangle = container.select('svg').append('g');

			that.zoomRectangle
				.attr('class', 'zoom')
				.style('text-anchor', 'middle')
				.append('rect')
				.attr('class', 'zoom-rectangle');

			that.zoomRectangle
				.append('g');

			that.zoomRectangle.origin = d3.mouse(this);
		})

		.on('mouseup', function() {

			if(!that.zoomRectangle) {
				return;
			}

			that.zoomRectangle.remove();

			const
				mouse = d3.mouse(this),
				filteredRows = that.rows.filter(row => {

					const item = that.bottom(row.get(that.axes.bottom.column)) + 100;

					if(mouse[0] < that.zoomRectangle.origin[0]) {
						return item >= mouse[0] && item <= that.zoomRectangle.origin[0];
					}
					else {
						return item <= mouse[0] && item >= that.zoomRectangle.origin[0];
					}
				});

			that.zoomRectangle = null;

			if(!filteredRows.length) {
				return;
			}

			that.rows = filteredRows;

			that.plot();
		}, true);
	}
});

Visualization.list.set('stacked', class Stacked extends LinearVisualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization', 'stacked');
		container.innerHTML = `
			<div id="visualization-${this.id}" class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>`;

		await this.source.fetch(options);

		await this.render(options);
	}

	async render(options = {}) {

		await this.draw();
		this.plot(options);
	}

	plot(options = {}) {

		super.plot(options);

		if(!this.rows || !this.rows.length) {
			return;
		}

		const that = this;

		const x1 = d3.scale.ordinal();
		this.x = d3.scale.ordinal();
		this.y = d3.scale.linear().range([this.height, 20]);

		const
			xAxis = d3.svg.axis()
				.scale(this.x)
				.orient('bottom'),

			yAxis = d3.svg.axis()
				.scale(this.y)
				.innerTickSize(-this.width)
				.orient('left');

		if(['s'].includes(this.axes.bottom.format)) {
			xAxis.tickFormat(d3.format(this.axes.left.format));
		}

		if(['s'].includes(this.axes.left.format)) {
			yAxis.tickFormat(d3.format(this.axes.left.format));
		}

		let max = 0;

		for(const row of this.rows) {

			let total = 0;

			for(const [name, value] of row) {
				if(this.axes.left.columns.some(c => c.key == name)) {
					total += parseFloat(value) || 0;
				}
			}

			max = Math.max(max, Math.ceil(total) || 0);
		}

		this.y.domain([0, max]);

		this.x.domain(this.rows.map(r => r.get(this.axes.bottom.column)));
		this.x.rangeBands([0, this.width], 0.1, 0);

		const
			biggestTick = this.x.domain().reduce((s, v) => s.length > v.length ? s : v, ''),
			tickNumber = Math.max(Math.floor(this.container.clientWidth / (biggestTick.length * 12)), 1),
			tickInterval = parseInt(this.x.domain().length / tickNumber),
			ticks = this.x.domain().filter((d, i) => !(i % tickInterval));

		xAxis.tickValues(ticks);
		x1.domain(this.columns.map(c => c.name)).rangeBands([0, this.x.rangeBand()]);

		this.svg
			.append('g')
			.attr('class', 'y scale')
			.call(yAxis)
			.attr('transform', `translate(${this.axes.left.width}, 0)`);

		this.svg
			.append('g')
			.attr('class', 'x scale')
			.attr('transform', `translate(${this.axes.left.width}, ${this.height})`)
			.call(xAxis);

		this.svg
			.append('text')
			.attr('transform', `translate(${(this.width / 2)}, ${this.height + 40})`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.bottom.label);

		this.svg
			.append('text')
			.attr('transform', `rotate(-90) translate(${(this.height / 2 * -1)}, 12)`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.left.label);

		const layer = this.svg
			.selectAll('.layer')
			.data(d3.layout.stack()(this.columns))
			.enter()
			.append('g')
			.attr('class', 'layer')
			.style('fill', d => d.color);

		let bars = layer
			.selectAll('rect')
			.data(column => column)
			.enter()
			.append('rect')
			.classed('bar', true)
			.on('click', function(_, row, column) {
				that.source.columns.get(that.columns[column].key).initiateDrilldown(that.rows[row]);
				d3.select(this).classed('hover', false);
			})
			.on('mouseover', function(_, __, column) {
				that.hoverColumn = that.columns[column];
				d3.select(this).classed('hover', true);
			})
			.on('mouseout', function() {
				that.hoverColumn = null;
				d3.select(this).classed('hover', false);
			})
			.attr('width', this.x.rangeBand())
			.attr('x',  cell => this.x(cell.x) + this.axes.left.width);

			 let values;

		if(this.options.showValues) {

			values = this.svg
				.append('g')
				.selectAll('g')
				.data(this.columns)
				.enter()
				.append('g')
				.selectAll('text')
				.data(column => column)
				.enter()
				.append('text')
				.attr('width', x1.rangeBand())
				.attr('fill', '#666')
				.attr('x', cell => {

					let value = Format.number(cell.y);

					if(['s'].includes(this.axes.left.format)) {
						value = d3.format('.4s')(cell.y);
					}

					return this.x(cell.x) + this.axes.left.width + (this.x.rangeBand() / 2) - (value.toString().length * 4);
				})
				.text(cell => {

					if(['s'].includes(this.axes.left.format)) {
						return d3.format('.4s')(cell.y);
					}
					else {
						return Format.number(cell.y)
					}
				});
		}

		if(!options.resize) {

			bars = bars
				.attr('height', d => 0)
				.attr('y', d => this.height)
				.transition()
				.delay((_, i) => (Page.animationDuration / this.x.domain().length) * i)
				.duration(Page.animationDuration)
				.ease('exp-out');

			if(values) {

				values = values
					.attr('y', cell => this.y(0))
					.attr('height', 0)
					.attr('opacity', 0)
					.transition()
					.delay((_, i) => (Page.animationDuration / this.x.domain().length) * i)
					.duration(Page.animationDuration)
					.ease('exp-out');
			}
		}

		bars
			.attr('height', d => this.height - this.y(d.y))
			.attr('y', d => this.y(d.y + d.y0));

		if(values) {

			values
				.attr('y', cell => this.y(cell.y > 0 ? cell.y + cell.y0 : 0) - 3)
				.attr('height', cell => {return Math.abs(this.y(cell.y + cell.y0) - this.y(0))})
				.attr('opacity', 1);
		}
	}
});

Visualization.list.set('area', class Area extends LinearVisualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization', 'area');
		container.innerHTML = `
			<div id="visualization-${this.id}" class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>`;

		await this.source.fetch(options);

		await this.render(options);
	}

	async render(options = {}) {

		await this.draw();
		this.plot(options);
	}

	plot(options = {}) {

		super.plot(options);

		if(!this.rows || !this.rows.length) {
			return;
		}

		const
			container = d3.selectAll(`#visualization-${this.id}`),
			that = this;

		this.x = d3.scale.ordinal();
		this.y = d3.scale.linear().range([this.height, 20]);

		const
			x1 = d3.scale.ordinal(),
			xAxis = d3.svg.axis()
				.scale(this.x)
				.orient('bottom'),

			yAxis = d3.svg.axis()
				.scale(this.y)
				.innerTickSize(-this.width)
				.orient('left');

		if(['s'].includes(this.axes.bottom.format)) {
			xAxis.tickFormat(d3.format(this.axes.left.format));
		}

		if(['s'].includes(this.axes.left.format)) {
			yAxis.tickFormat(d3.format(this.axes.left.format));
		}

		let
			max = 0,
			min = 0;

		for(const row of this.rows) {

			let total = 0;

			for(const [name, value] of row) {

				if(name == this.axes.bottom.column) {
					continue;
				}

				if(this.source.columns.get(name).disabled) {
					continue;
				}

				if(this.source.columns.get(name).hidden) {
					continue;
				}

				total += parseFloat(value) || 0;
				min = Math.min(min, Math.floor(value) || 0);
			}

			max = Math.max(max, Math.ceil(total) || 0);
		}

		this.y.domain([min, max]);
		this.x.domain(this.rows.map(r => r.get(this.axes.bottom.column)));
		this.x.rangePoints([0, this.width], 0.1, 0);

		const
			biggestTick = this.x.domain().reduce((s, v) => s.length > v.length ? s : v, ''),
			tickNumber = Math.max(Math.floor(this.container.clientWidth / (biggestTick.length * 12)), 1),
			tickInterval = parseInt(this.x.domain().length / tickNumber),
			ticks = this.x.domain().filter((d, i) => !(i % tickInterval)),

			area = d3.svg.area()
				.x(d => this.x(d.x))
				.y0(d => this.y(d.y0))
				.y1(d => this.y(d.y0 + d.y));

		xAxis.tickValues(ticks);
		x1.domain(this.columns.map(c => c.name)).rangeBands([0, this.x.rangeBand()]);

		this.svg
			.append('g')
			.attr('class', 'y scale')
			.call(yAxis)
			.attr('transform', `translate(${this.axes.left.width}, 0)`);

		this.svg
			.append('g')
			.attr('class', 'x scale')
			.attr('transform', `translate(${this.axes.left.width}, ${this.height})`)
			.call(xAxis);

		this.svg
			.append('text')
			.attr('transform', `translate(${(this.width / 2)}, ${this.height + 40})`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.bottom.label);

		this.svg
			.append('text')
			.attr('transform', `rotate(-90) translate(${(this.height / 2 * -1)}, 12)`)
			.attr('class', 'axis-label')
			.style('text-anchor', 'middle')
			.text(this.axes.left.label);

		let areas = this.svg
			.selectAll('.path')
			.data(d3.layout.stack()(this.columns))
			.enter()
			.append('g')
			.attr('transform', `translate(${this.axes.left.width}, 0)`)
			.attr('class', 'path')
			.append('path')
			.classed('bar', true)
			.on('mouseover', function(column) {
				that.hoverColumn = column;
				d3.select(this).classed('hover', true);
			})
			.on('mouseout', function() {
				that.hoverColumn = null;
				d3.select(this).classed('hover', false);
			})
			.attr('d', d => area(d))
			.style('fill', d => d.color);

		if(this.options.showValues) {

			this.svg
				.append('g')
				.selectAll('g')
				.data(this.columns)
				.enter()
				.append('g')
				.attr('transform', column => `translate(${x1(column.name)}, 0)`)
				.selectAll('text')
				.data(column => column)
				.enter()
				.append('text')
				.attr('width', x1.rangeBand())
				.attr('fill', '#666')
				.attr('x', cell => {

					let value = Format.number(cell.y);

					if(['s'].includes(this.axes.left.format)) {
						value = d3.format('.4s')(cell.y);
					}

					return this.x(cell.x) + this.axes.left.width + (x1.rangeBand() / 2) - (value.toString().length * 4)
				})
				.text(cell => {

					if(['s'].includes(this.axes.left.format)) {
						return d3.format('.4s')(cell.y);
					}

					else {
						return Format.number(cell.y)
					}
				})
				.attr('y', cell => this.y(cell.y > 0 ? cell.y : 0) - 5);
		}

		if(!options.resize) {

			areas = areas
				.attr('opacity', 0)
				.transition()
				.duration(Page.animationDuration)
				.ease("exp-out");
		}

		areas.attr('opacity', 0.8);

		// For each line appending the circle at each point
		for(const column of this.columns) {

			this.svg
				.selectAll('dot')
				.data(column)
				.enter()
				.append('circle')
				.attr('class', 'clips')
				.classed('drilldown', cell => that.source.columns.get(cell.key).drilldown)
				.attr('id', (d, i) => i)
				.attr('r', 0)
				.style('fill', column.color)
				.attr('cx', cell => this.x(cell.x) + this.axes.left.width)
				.attr('cy', cell => this.y(cell.y + cell.y0))
				.on('mouseover', function(cell) {

					if(!that.source.columns.get(cell.key).drilldown) {
						return;
					}

					d3.select(this)
						.attr('r', 6)
						.transition()
						.duration(Page.animationDuration)
						.attr('r', 12);

					d3.select(this).classed('hover', 1);
				})
				.on('mouseout', function(cell) {

					if(!that.source.columns.get(cell.key).drilldown) {
						return;
					}

					d3.select(this)
						.transition()
						.duration(Page.animationDuration)
						.attr('r', 6);

					d3.select(this).classed('hover', 0);
				})
				.on('click', (cell, row) => {
					that.source.columns.get(cell.key).initiateDrilldown(that.rows[row]);
				});
		}

		container
		.on('mousemove.area', function() {

			container.selectAll('svg > g > circle.clips').attr('r', 0);

			const
				mouse = d3.mouse(this),
				xpos = parseInt((mouse[0] - that.axes.left.width - 10) / (that.width / that.rows.length)),
				row = that.rows[xpos];

			if(!row || that.zoomRectangle) {
				return;
			}

			container.selectAll(`svg > g > circle[id='${xpos}'].clips`).attr('r', 6);
		})

		.on('mouseout.area', () => container.selectAll('svg > g > circle.clips').attr('r', 0));
	}
});

Visualization.list.set('funnel', class Funnel extends Visualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization', 'funnel');
		container.innerHTML = `
			<div id="visualization-${this.id}" class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>`;

		await this.source.fetch(options);

		await this.render(options);
	}

	async render(options = {}) {

		const
			series = [],
			rows = await this.source.response();

		if(rows.length > 1) {

			for(const [i, row] of rows.entries()) {

				series.push([{
					date: 0,
					label: row.get('name'),
					color: DataSourceColumn.colors[i],
					y: row.get('value'),
				}]);
			}
		} else {

			for(const column of this.source.columns.values()) {

				if(column.disabled) {
					continue;
				}

				series.push([{
					date: 0,
					label: column.name,
					color: column.color,
					y: rows[0].get(column.key),
				}]);
			}
		}


		this.draw({
			series: series.reverse(),
			divId: `#visualization-${this.id}`,
			chart: {},
			options,
		});
	}

	draw(obj) {

		const options = obj.options;

		d3.selectAll(obj.divId).on('mousemove', null)
			.on('mouseout', null)
			.on('mousedown', null)
			.on('click', null);

		var chart = {};

		// Setting margin and width and height
		var margin = {top: 20, right: 0, bottom: 60, left: 0},
			width = this.container.clientWidth - margin.left - margin.right,
			height = this.container.clientHeight - margin.top - margin.bottom;

		var x = d3.scale.ordinal()
			.domain([0, 1])
			.rangeBands([0, width], 0.1, 0);

		var y = d3.scale.linear().range([height, margin.top]);

		// Defining xAxis location at bottom the axes
		var xAxis = d3.svg.axis().scale(x).orient("bottom");

		var diagonal = d3.svg.diagonal()
			.source(d => {
				return {x: d[0].y + 5, y: d[0].x};
			})
			.target(d => {
				return {x: d[1].y + 5, y: d[1].x};
			})
			.projection(d => [d.y, d.x]);

		var series = d3.layout.stack()(obj.series);

		series.map(r => r.data = r);

		chart.plot = (options = {}) => {

			var funnelTop = width * 0.60,
				funnelBottom = width * 0.2,
				funnelBottonHeight = height * 0.2;

			//Empty the container before loading
			d3.selectAll(obj.divId + " > *").remove();
			//Adding chart and placing chart at specific locaion using translate
			var svg = d3.select(obj.divId)
				.append("svg")
				.append("g")
				.attr("class", "chart")
				.attr("transform", "translate(" + margin.left + "," + margin.top + ")");

			//check if the data is present or not
			if (series.length == 0 || series[0].data.length == 0) {
				//Chart Title
				svg.append('g').attr('class', 'noDataWrap').append('text')
					.attr("x", (width / 2))
					.attr("y", (height / 2))
					.attr("text-anchor", "middle")
					.style("font-size", "20px")
					.text(obj.loading ? "Loading Data ..." : "No data to display");
				return;
			}

			x.domain([0]);
			x.rangeBands([0, width], 0.1, 0);
			y.domain([
				0,
				d3.max(series, function (c) {
					return d3.max(c.data, function (v) {
						return Math.ceil(v.y0 + v.y);
					});
				}) + 4
			]);

			var layer = svg.selectAll(".layer")
				.data(series)
				.enter().append("g")
				.attr("class", "layer")
				.style("fill", d => d[0].color);

			let rectangles = layer.selectAll("rect")
				.data(function (d) {
					return d.data;
				})
				.enter().append("rect")
				.attr("x", d => x(d.date))
				.attr("width", x.rangeBand())

			if(!options.resize) {
				rectangles = rectangles
					.attr("height", d => 0)
					.attr("y", d => 30)
					.transition()
					.duration(Page.animationDuration);
			}

			rectangles
				.attr("height", d => y(d.y0) - y(d.y + d.y0))
				.attr("y", d => y(d.y + d.y0));

			var poly1 = [
				{x: 0, y: margin.top},
				{x: (width - funnelTop) / 2, y: margin.top},
				{x: (width - funnelBottom) / 2, y: height - funnelBottonHeight},
				{x: (width - funnelBottom) / 2, y: height},
				{x: 0, y: height}
			];

			var poly2 = [
				{x: width, y: margin.top},
				{x: (width - funnelTop) / 2 + funnelTop + 5, y: margin.top},
				{x: (width - funnelBottom) / 2 + funnelBottom + 5, y: height - funnelBottonHeight},
				{x: (width - funnelBottom) / 2 + funnelBottom + 5, y: height},
				{x: width, y: height}
			];

			var polygon = svg.selectAll("polygon")
				.data([poly2, poly1])
				.enter().append("polygon")
				.attr('points', d =>  d.map(d => [d.x, d.y].join()).join(' '))
				.attr('class', 'background');

			//selecting all the paths
			var path = svg.selectAll('rect'),
				that = this;

			//mouse over function
			path .on('mousemove', function(d) {

				var cord = d3.mouse(this);

				if (cord[1] < 2 * margin.top || cord[1] > (height + 2 * margin.top) || cord[0] < margin.left || cord[0] > (width + margin.left) || series.length == 0 || series[0].data.length == 0) {
					return
				}

				const content = `
					<header>${d.label}</header>
					<div class="body">${d.y}</div>
				`;

				Tooltip.show(that.container, [cord[0], cord[1]], content);
			});
			polygon.on('mouseover', function () {
				Tooltip.hide(that.container);
			});

			var labelConnectors = svg.append('g').attr('class', 'connectors');
			var previousLabelHeight = 0, singPoint = height / d3.max(y.domain());
			for (var i = 0; i < series.length; i++) {
				var section = series[i].data[0];
				var startLocation = section.y0 * singPoint,
					sectionHeight = section.y * singPoint,
					bottomLeft = funnelBottonHeight - startLocation,
					x1, y1,  endingPintY, curveData;
				var label = labelConnectors.append('g');
				var text;

				//for lower part of the funnel
				if (sectionHeight / 2 < bottomLeft) {

					x1 = (width + funnelBottom) / 2;
					y1 = (startLocation + sectionHeight / 2);

					endingPintY = y1;

					if (endingPintY - previousLabelHeight <= 10) {
						endingPintY = previousLabelHeight + 5;
					}

					curveData = [
						{x: x1, y: (height) - y1 - 5},
						{x: x1 + (window.innerWidth < 768 ? 30 : 50), y: height - endingPintY}
					];

					text = label.append('text')
						.attr('x', x1 + (window.innerWidth < 768 ? 35 : 60))
						.attr('y', height - (endingPintY))
						.attr('text-anchor', 'left')
						.style('font-size', '15px')

					if (window.innerWidth < 768) {
						text.style('font-size', '10px');
					}
					text.append('tspan')
						.attr('x', x1 + (window.innerWidth < 768 ? 35 : 60))
						.attr('dx', '0')
						.attr('dy', '1em')
						.attr('class', 'text')
						.text(series[i].data[0].label);

					text.append('tspan')
						.attr('x', x1 + (window.innerWidth < 768 ? 35 : 60))
						.attr('dx', '0')
						.attr('dy', '1.2em')
						.attr('class', 'sub-text')
						.style('font-size', '13px')
						.text(`${series[i].data[0].y}  (${(series[i].data[0].y / series[series.length - 1].data[0].y * 100).toFixed(2)}%)`);

				} else {

					//for upper part of the funnel
					var arr = findInterSection(
						width / 2, height - (startLocation + sectionHeight / 2),
						width, height - (startLocation + sectionHeight / 2),
						(width + funnelTop) / 2, margin.top,
						(width + funnelBottom) / 2, height - funnelBottonHeight);

					x1 = arr[0];
					y1 = arr[1];

					endingPintY = y1;
					if ((endingPintY - (endingPintY - previousLabelHeight)) <= 15)
						endingPintY = previousLabelHeight + endingPintY + 15;

					curveData = [
						{x: x1, y: y1},
						{x: x1 + (window.innerWidth < 768 ? 30 : 50), y: endingPintY-20}
					];

					text = label.append('text')
						.attr('x', x1 + (window.innerWidth < 768 ? 40 : 70))
						.attr('y', endingPintY-20)
						.attr('text-anchor', 'left')
						.style('font-size', '15px');

					if (window.innerWidth < 768) {
						text.style('font-size', '10px');
					}

					text.append('tspan')
						.attr('x', x1 + (window.innerWidth < 768 ? 35 : 60))
						.attr('dx', '0')
						.attr('dy', '1em')
						.attr('class', 'text')
						.text(series[i].data[0].label);

					text.append('tspan')
						.attr('x', x1 + (window.innerWidth < 768 ? 35 : 60))
						.attr('dx', '0')
						.attr('dy', '1.2em')
						.attr('class', 'sub-text')
						.style('font-size', '13px')
						.text(`${series[i].data[0].y} (${(series[i].data[0].y / series[series.length - 1].data[0].y * 100).toFixed(2)}%)`);
				}

				previousLabelHeight = endingPintY + 45;

				label.datum(curveData)
					.append('path')
					.attr('class', 'link')
					.attr('d', diagonal)
					.attr('class', 'line-stroke')
					.attr('stroke-width', 1)
					.attr('fill', 'none');
			}
		};

		chart.plot(options);

		window.addEventListener('resize', () => {
			width = this.container.clientWidth - margin.left - margin.right;
			chart.plot({resize: true});
		});

		function findInterSection(x1, y1, x2, y2, x3, y3, x4, y4) {
			var m1 = (y2 - y1) / (x2 - x1), m2 = (y4 - y3) / (x4 - x3), b1 = (y1 - m1 * x1), b2 = (y3 - m2 * x3);
			return [((b2 - b1) / (m1 - m2)), -1 * ((b1 * m2 - b2 * m1) / (m1 - m2))];
		}

		return chart;
	}
});

Visualization.list.set('pie', class Pie extends Visualization {

	constructor(visualization, source) {

		super(visualization, source);

		this.options.nameColumn = this.options.nameColumn || 'name';
		this.options.valueColumn = this.options.valueColumn || 'value';

		this.options.transformations = this.options.transformations || [];
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization', 'pie');
		container.innerHTML = `
			<div id="visualization-${this.id}" class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>`;

		await this.source.fetch(options);

		this.source.originalColumns = new Map(this.source.columns);

		const dataRow = this.source.originalResponse.data[0];

		if(!dataRow) {

			return this.source.error('No data found.');
		}

		if((this.options.nameColumn in dataRow) || (this.options.valueColumn in dataRow)) {

			const [pivotPresent] = this.options.transformations.filter(x => x.type == 'pivot' && x.implied);

			if(!pivotPresent) {

				this.options.transformations.push({
					type: 'pivot',
					options: {
						rows: [],
						values: [{column: this.options.valueColumn, function: 'sum'}],
						columns: [{column: this.options.nameColumn}],
					},
					implied: true,
				});
			}
		}

		await this.render(options);
	}

	async render(options = {}) {

		const originalResponse = this.source.originalResponse.data;

		if(!originalResponse.length) {

			return this.source.error('No data found.');
		}

		if(!(this.options.nameColumn in originalResponse[0]) && originalResponse.length > 1) {

			return this.source.error('Invalid name column.');
		}

		if(!(this.options.valueColumn in originalResponse[0]) && originalResponse.length > 1) {

			return this.source.error('Invalid value column.');
		}

		this.rows = await this.source.response();

		if(!this.rows|| !this.rows.length || !this.rows[0].size) {

			return this.source.error();
		}

		this.rows = this.rows[0];

		this.height = this.container.clientHeight - 20;
		this.width = this.container.clientWidth - 20;

		window.addEventListener('resize', () => {

			const
				height = this.container.clientHeight - 20,
				width = this.container.clientWidth - 20;

			if(this.width != width || this.height != height) {
				this.render({resize: true});
			}
		});

		const
			container = d3.selectAll(`#visualization-${this.id}`),
			radius = Math.min(this.width - 50, this.height - 50) / 2,
			that = this;

		container.selectAll('*').remove();

		const
			data = [],
			sum = Array.from(this.rows.values()).reduce((sum, value) => sum + value, 0);

		for(const [name, value] of this.rows) {

			data.push({name, value, percentage: Math.floor((value / sum) * 10000) / 100});
		}

		const

			pie = d3.layout
				.pie()
				.value(row => row.percentage),

			arc = d3.svg.arc()
				.outerRadius(radius)
				.innerRadius(this.options && this.options.classicPie ? 0 : radius - 75),

			arcHover = d3.svg.arc()
				.outerRadius(radius + 10)
				.innerRadius(this.options && this.options.classicPie ? 0 : radius - 75),

			svg = container
				.append('svg')
				.data([data.sort((a, b) => a.percentage - b.percentage)])
				.append('g')
				.attr('transform', `translate(${this.width / 2}, ${this.height / 2})`),

			arcs = svg
				.selectAll('g')
				.data(pie)
				.enter()
				.append('g')
				.attr('class', 'pie'),

			labels = svg.append('g')
				.attr('class', 'labels'),

			subLabels = svg.append('g')
				.attr('class', 'sub-labels'),

			lines = svg.append('g')
				.attr('class', 'lines'),

			slice = arcs.append('path')
				.attr('fill', row => this.source.columns.get(row.data.name).color)
				.classed('pie-slice', true);

		slice
			.on('click', function(column, _, row) {
				that.source.columns.get(column.data.name).initiateDrilldown(that.rows[row]);
				d3.select(this).classed('hover', false);
			})
			.on('mousemove', function(row) {

				const mouse = d3.mouse(this);

				mouse[0] += that.width / 2;
				mouse[1] += that.height / 2;

				const content = `
					<header>${that.source.columns.get(row.data.name).name}</header>
					<ul class="body">
						${row.data.value} (${row.data.percentage}%)
					</ul>
				`;

				if(that.container.querySelector('.loading')) {
					return;
				}

				Tooltip.show(that.container, mouse, content, row);

				d3.select(this).classed('hover', true);
			})

			.on('mouseenter', function(row) {

				d3
					.select(this)
					.transition()
					.duration(Page.animationDuration / 3)
					.attr('d', row => arcHover(row));
			})

			.on('mouseleave', function() {

				d3
					.select(this)
					.transition()
					.duration(Page.animationDuration / 3)
					.attr('d', row => arc(row));

				Tooltip.hide(that.container);

				d3.select(this).classed('hover', false);
			});

		if(!options.resize) {
			slice
				.transition()
				.duration(Page.animationDuration / data.length * 2)
				.delay((_, i) => i * Page.animationDuration / data.length)
				.attrTween('d', function(d) {

					const i = d3.interpolate(d.endAngle, d.startAngle);

					return t => {
						d.startAngle = i(t);
						return arc(d)
					}
				});
		} else {
			slice.attr('d', row => arc(row));
		}

		if(!this.options) {
			return;
		}

		// Add the text

		if(!this.options.showName && !this.options.showValue && !this.options.showPercentage) {
			return;
		}

		if(this.options.labelPosition == 'outside') {

			function midAngle(d) {
				return d.startAngle + (d.endAngle - d.startAngle) / 2;
			}

			const outerArc = d3.svg.arc()
				.innerRadius(radius * 0.9)
				.outerRadius(radius * 0.9);

			const text = svg.select('.labels')
				.selectAll('text')
				.data(pie(data));

				text.enter()
				.append('text')
				.attr('dy', '.35em')
				.text(d => {

					if(this.options.showName) {
						return d.data.name;
					}

					else if(this.options.showValue && this.options.showPercentage) {
						return `${Format.number(d.data.value)} (${Format.number(d.data.percentage)}%)`;
					}

					else if(this.options.showValue) {
						return Format.number(d.data.value);
					}

					else if(this.options.showPercentage) {
						return `${Format.number(d.data.percentage)}%`;
					}
				});

			text.transition()
				.duration(1000)
				.attrTween('transform', function(d) {

					this.current = this.current || d;

					const interpolate = d3.interpolate(this.current, d);

					this.current = interpolate(0);

					return t => {

						const
							d2 = interpolate(t),
							pos = outerArc.centroid(d2);

						pos[0] = radius * (midAngle(d2) < Math.PI ? 1 : -1);
						pos[0] = pos[0] < 0 ? pos[0] + (-20) : pos[0] + 20;

						return `translate(${pos})`;
					};
				})
				.styleTween('text-anchor', function(d) {

					this.current = this.current || d;

					const interpolate = d3.interpolate(this.current, d);

					this.current = interpolate(0);

					return t => {
						return midAngle(interpolate(t)) < Math.PI ? 'start' : 'end';
					};
				})
				.attr('class', 'text');

			if(this.options.showName) {

				const subText = svg.select('.sub-labels')
					.selectAll('.sub-text')
					.data(pie(data));

					subText.enter()
					.append('text')
					.attr('dy', '.35em')
					.text(d => {

						if(this.options.showValue && this.options.showPercentage) {
							return `${Format.number(d.data.value)} (${Format.number(d.data.percentage)}%)`;
						}

						else if(this.options.showValue) {
							return Format.number(d.data.value);
						}

						else if(this.options.showPercentage) {
							return `${Format.number(d.data.percentage)}%`;
						}
					});

				subText.transition()
					.duration(1000)
					.attrTween('transform', function(d) {

						this.current = this.current || d;

						const interpolate = d3.interpolate(this.current, d);

						this.current = interpolate(0);

						return t => {

							const
								d2 = interpolate(t),
								pos = outerArc.centroid(d2);

							pos[0] = radius * (midAngle(d2) < Math.PI ? 1 : -1);
							pos[0] = pos[0] < 0 ? pos[0] + (-20) : pos[0] + 20;

							pos[1] = pos[1] + 20;

							return `translate(${pos})`;
						};
					})
					.styleTween('text-anchor', function(d) {

						this.current = this.current || d;

						const interpolate = d3.interpolate(this.current, d);

						this.current = interpolate(0);

						return t => {
							return midAngle(interpolate(t)) < Math.PI ? 'start' : 'end';
						};
					})
					.attr('class', 'sub-text');
			}

			const polylineLight = svg.select('.lines')
				.selectAll('.light')
				.data(pie(data));

			polylineLight.enter()
				.append('polyline')
				.classed('polyline light', true);

			polylineLight.transition()
				.duration(1000)
				.attrTween('points', function(d) {

					this.current = this.current || d;

					const interpolate = d3.interpolate(this.current, d);

					this.current = interpolate(0);

					return t => {

						const
							d2 = interpolate(t),
							pos = outerArc.centroid(d2);

						pos[0] = radius * 0.95 * (midAngle(d2) < Math.PI ? 1 : -1);
						pos[0] = pos[0] < 0 ? pos[0] + (-20) : pos[0] + 20;

						return [arc.centroid(d2), outerArc.centroid(d2), pos];
					};
				});

			const polylineDark = svg.select('.lines')
				.selectAll('.dark')
				.data(pie(data));

			polylineDark.enter()
				.append('polyline')
				.classed('polyline dark', true);

			polylineDark.transition()
				.duration(1000)
				.attrTween('points', function(d) {

					this.current = this.current || d;

					const interpolate = d3.interpolate(this.current, d);

					this.current = interpolate(0);

					return t => {

						const
							d2 = interpolate(t),
							pos = outerArc.centroid(d2);

						pos[0] = radius * 0.95 * (midAngle(d2) < Math.PI ? 1 : -1);
						pos[0] = pos[0] < 0 ? pos[0] + (-20) : pos[0] + 20;

						return [arc.centroid(d2), outerArc.centroid(d2), pos];
					};
			});
		}

		if(this.options.labelPosition == 'inside') {

			arcs.append('text')
				.attr('transform', row => {
					row.innerRadius = radius - 50;
					row.outerRadius = radius;
					return `translate(${arc.centroid(row)})`;
				})
				.attr('text-anchor', 'middle')
				.text(d => {

					if(this.options.showName) {
						return d.data.name;
					}

					else if(this.options.showValue && this.options.showPercentage) {
						return `${Format.number(d.data.value)} (${Format.number(d.data.percentage)}%)`;
					}

					else if(this.options.showValue) {
						return Format.number(d.data.value);
					}

					else if(this.options.showPercentage) {
						return `${Format.number(d.data.percentage)}%`;
					}
				});


			if(this.options.showName) {

				arcs.append('text')
					.attr('transform', row => {
						row.innerRadius = radius - 50;
						row.outerRadius = radius;

						const pos = arc.centroid(row);
						pos[1] = pos[1] + 20;
						return `translate(${pos})`;
					})
					.attr('text-anchor', 'middle')
					.text(d => {

						if(this.options.showValue && this.options.showPercentage) {
							return `${Format.number(d.data.value)} (${Format.number(d.data.percentage)}%)`;
						}

						else if(this.options.showValue) {
							return Format.number(d.data.value);
						}

						else if(this.options.showPercentage) {
							return `${Format.number(d.data.percentage)}%`;
						}
					})
					.attr('class', 'sub-text');
			}
		}
	}
});

Visualization.list.set('spatialmap', class SpatialMap extends Visualization {

	constructor(visualization, source) {

		super(visualization, source);

		if(!this.options) {

			this.options = {layers: []};
		}

		this.layers = new SpatialMapLayers(this.options.layers || [], this);
		this.themes = new SpatialMapThemes(this);
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization', 'spatial-map');

		container.innerHTML = `
			<div class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		container.appendChild(this.layers.container);

		return container;
	}

	async load(options = {}) {

		super.render(options);

		await this.source.fetch(options);

		await this.render();
	}

	async render() {

		if(!this.options) {
			return this.source.error('Map layers not defined');
		}

		if(!this.options.layers || !this.options.layers.length) {
			return this.source.error('Map layers not defined.');
		}

		const zoom = this.options.zoom || 12;

		this.rows = await this.source.response();

		if(!this.map) {
			this.map = new google.maps.Map(this.containerElement.querySelector('.container'), {zoom});
		}

		this.map.setCenter({
			lat: this.options.centerLatitude || parseFloat(this.rows[0].get(this.options.layers[0].latitudeColumn)),
			lng: this.options.centerLongitude || parseFloat(this.rows[0].get(this.options.layers[0].longitudeColumn))
		});

		this.map.set('styles', this.themes.get(this.options.theme).config || []);

		this.layers.render();
	}
});

Visualization.list.set('cohort', class Cohort extends Visualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('section');

		container.classList.add('visualization', 'cohort');

		container.innerHTML = `
			<div class="container"></div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `
			<div class="loading">
				<i class="fa fa-spinner fa-spin"></i>
			</div>
		`;

		if(this.related_visualizations && this.related_visualizations.length) {

			this.container.style.cursor = 'pointer';

			const actions = this.source.container.querySelector('header .actions');

			const card_info = this.source.container.querySelector('header .actions .card-info');

			if(!card_info) {

				actions.insertAdjacentHTML('beforeend', `
					<span class="card-info" title="${this.related_visualizations.length + (this.related_visualizations.length > 1 ? ' sub-cards' : ' sub-card')}">
						<i class="fas fa-ellipsis-h"></i>
					</span>
				`);
			}
		}

		this.container.on('click', async () => await this.showSubVisualizations());

		await this.source.fetch(options);

		await this.process();
		await this.render(options);
	}

	async process() {

		this.max = 0;

		const response = await this.source.response();

		response.pop();

		for(const row of response) {

			for(const column of row.get('data') || []) {
				this.max = Math.max(this.max, column.count);
			}
		}
	}

	async render() {

		const
			container = this.container.querySelector('.container'),
			table = document.createElement('table'),
			tbody = document.createElement('tbody'),
			type = this.source.filters.get('type').label.querySelector('input').value,
			response = await this.source.response();

		container.textContent = null;

		table.insertAdjacentHTML('beforeend', `
			<thead>
				<tr>
					<th class="sticky">${type[0].toUpperCase() + type.substring(1)}</th>
					<th class="sticky">Cohort Size</th>
					<th class="sticky">
						${response.length && response[0].get('data').map((v, i) => type[0].toUpperCase()+type.substring(1)+' '+(++i)).join('</th><th class="sticky">')}
					</th>
				</tr>
			</thead>
		`);

		for(const row of response) {

			const cells = [];

			for(const cell of row.get('data')) {

				let contents = Format.number(cell.percentage) + '%';

				if(cell.href) {
					contents = `<a href="${cell.href}" target="_blank">${contents}</a>`;
				}

				cells.push(`
					<td style="${this.getColor(cell.count)}" class="${cell.href ? 'href' : ''}" title="${cell.description}">
						${contents}
					</td>
				`);
			}

			let size = Format.number(row.get('size'));

			if(row.get('baseHref'))
				size = `<a href="${row.get('baseHref')}" target="_blank">${size}</a>`;

			tbody.insertAdjacentHTML('beforeend', `
				<tr>
					<td class="sticky">${Format.date(row.get('timing'))}</td>
					<td class="sticky ${row.get('baseHref') ? 'href' : ''}">${size}</td>
					${cells.join('')}
				</tr>
			`);
		}

		if(!response.length)
			table.innerHTML = `<caption class="NA">${this.source.originalResponse.message || 'No data found!'}</caption>`;

		table.appendChild(tbody);
		container.appendChild(table);
	}

	getColor(count) {

		const intensity = Math.floor((this.max - count) / this.max * 255);

		return `background: rgba(255, ${intensity}, ${intensity}, 0.8)`;
	}
});

Visualization.list.set('bigtext', class NumberVisualizaion extends Visualization {

	get container() {

		if (this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('section');

		container.classList.add('visualization', 'bigtext');

		container.innerHTML = `
			<div class="container"></div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `
			<div class="loading">
				<i class="fa fa-spinner fa-spin"></i>
			</div>
		`;

		if(this.related_visualizations && this.related_visualizations.length) {

			this.container.style.cursor = 'pointer';

			const actions = this.source.container.querySelector('header .actions');

			const card_info = this.source.container.querySelector('header .actions .card-info');

			if(!card_info) {

				actions.insertAdjacentHTML('beforeend', `
					<span class="card-info" title="${this.related_visualizations.length + (this.related_visualizations.length > 1 ? ' sub-cards' : ' sub-card')}">
						<i class="fas fa-ellipsis-h"></i>
					</span>
				`);
			}

			this.container.on('click', async () => await this.showSubVisualizations());
		}

		await this.source.fetch(options);

		await this.process();

		await this.render(options);
	}

	async process() {

		const response = await this.source.response();

		if(!this.options || !this.options.column) {
			return this.source.error('Value column not selected.');
		}

		if(!response || !response.length) {
			return this.source.error('Invalid Response.');
		}

		if(!response[0].has(this.options.column)) {
			return this.source.error(`<em>${this.options.column}</em> column not found.`);
		}
	}

	async render(options = {}) {

		if(!this.options)
			return;

		const response = await this.source.response();

		if(!response || !response.length) {
			return this.source.error();
		}

		let value = response[0].getTypedValue(this.options.column);

		this.container.querySelector('.container').innerHTML = `<div class="value">${value}</div>`;

		if(this.options.fontSize) {
			this.container.querySelector('.value').style.fontSize = `${this.options.fontSize}%`;
		}
	}
});

Visualization.list.set('livenumber', class LiveNumber extends Visualization {

	get container() {

		if (this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('section');

		container.classList.add('visualization', 'livenumber');
		container.id = `visualization-${this.id}`;

		container.innerHTML = `
			<div class="graph"></div>
			<div class="container"></div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.source.columns.render();

		this.container.querySelector('.container').innerHTML = `
			<div class="loading">
				<i class="fa fa-spinner fa-spin"></i>
			</div>
		`;
		this.container.querySelector('.graph').textContent = null;

		if(this.related_visualizations && this.related_visualizations.length) {

			this.container.style.cursor = 'pointer';

			const actions = this.source.container.querySelector('header .actions');

			const card_info = this.source.container.querySelector('header .actions .card-info');

			if(!card_info) {

				actions.insertAdjacentHTML('beforeend', `
					<span class="card-info" title="${this.related_visualizations.length + (this.related_visualizations.length > 1 ? ' sub-cards' : ' sub-card')}">
						<i class="fas fa-ellipsis-h"></i>
					</span>
				`);
			}

			this.container.on('click', async () => await this.showSubVisualizations());
		}

		await this.source.fetch(options);

		await this.process();

		this.render(options);
	}

	async process() {

		if(!this.options) {
			return this.source.error('Visualization configuration not set.');
		}

		if(!this.options.timingColumn) {
			return this.source.error('Timing column not selected.');
		}

		if(!this.options.valueColumn) {
			return this.source.error('Value column not selected.');
		}

		this.dates = new Map;

		for(const row of await this.source.response()) {

			if(!row.has(this.options.timingColumn)) {
				return this.source.error(`Timing column '${this.options.timingColumn}' not found.`);
			}

			if(!row.has(this.options.valueColumn)) {
				return this.source.error(`Value column '${this.options.valueColumn}' not found.`);
			}

			if(!Date.parse(row.get(this.options.timingColumn))) {
				return this.source.error(`Timing column value '${row.get(this.options.timingColumn)}' is not a valid date.`);
			}

			this.dates.set(Date.parse(new Date(row.get(this.options.timingColumn)).toISOString().substring(0, 10)), row);
		}

		let today = new Date();

		today = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), today.getHours(), today.getMinutes(), today.getSeconds()));

		this.center = {
			value: null,
			date: Date.parse(new Date(new Date(today - ((this.options.centerOffset || 0) * 24 * 60 * 60 * 1000))).toISOString().substring(0, 10)),
		};

		if(this.dates.has(this.center.date))
			this.center.value = this.dates.get(this.center.date).get(this.options.valueColumn);

		if(this.options.rightOffset != '') {

			this.right = {
				value: 0,
				date: Date.parse(new Date(this.center.date - ((this.options.rightOffset || 0) * 24 * 60 * 60 * 1000)).toISOString().substring(0, 10)),
			};

			if(this.dates.has(this.right.date)) {

				const value = this.dates.get(this.right.date).get(this.options.valueColumn);

				if(!isNaN(parseFloat(this.center.value))) {

					let _value;

					if((this.center.value >= 0 && value >= 0) || (this.center.value < 0 && value > 0)) {

						_value = this.center.value - value;
					}
					else if((this.center.value <= 0 && value <= 0) || (this.center.value >= 0 && value <= 0)) {

						_value = value - this.center.value;
					}

					if(value) {
						this.right.percentage = _value / value * 100;
					}
				}

				this.right.value = value;
			}
		}

		if(this.options.leftOffset != '') {

			this.left = {
				value: 0,
				date: Date.parse(new Date(this.center.date - ((this.options.leftOffset || 0) * 24 * 60 * 60 * 1000)).toISOString().substring(0, 10)),
			};

			if(this.dates.has(this.left.date)) {

				const value = this.dates.get(this.left.date).get(this.options.valueColumn);

				if(!isNaN(parseFloat(this.center.value))) {

					let _value;

					if((this.center.value >= 0 && value >= 0) || (this.center.value < 0 && value > 0)) {

						_value = this.center.value - value;
					}
					else if((this.center.value <= 0 && value <= 0) || (this.center.value >= 0 && value <= 0)) {

						_value = value - this.center.value;
					}

					if(value) {
						this.left.percentage = _value / value * 100;
					}
				}

				this.left.value = value;
			}
		}
	}

	render(options = {}) {

		if(!this.center) {
			return this.source.error(`Center column not defined.`);
		}

		const container = this.container.querySelector('.container');

		container.innerHTML = `<h5>${this.dates.get(this.center.date) ? this.dates.get(this.center.date).getTypedValue(this.options.valueColumn) : ''}</h5>`;
		this.center.container = this.container.querySelector('h5');

		if(this.left) {

			container.insertAdjacentHTML('beforeend', `
				<div class="left">
					<h6 class="percentage ${this.getColor(this.left.percentage)}">
						${this.options.changePrefix || ''}
						${this.left.percentage ? Format.number(this.left.percentage) + '%' : '-'}
						${this.options.changePostfix || ''}
					</h6>
					<span class="value">
						<span class="value-left">${this.dates.get(this.left.date) ? this.dates.get(this.left.date).getTypedValue(this.options.valueColumn) : ''}</span><br>
						<small title="${Format.date(this.left.date)}">
							${Format.number(this.options.leftOffset)} ${this.options.leftOffset == '1'? 'day' : 'days'} ago
						</small>
					</span>
				</div>
			`);

			this.left.container = this.container.querySelector('.value-left');
		}

		if(this.right) {

			container.insertAdjacentHTML('beforeend', `
				<div class="right">
					<h6 class="percentage ${this.getColor(this.right.percentage)}">${this.right.percentage ? Format.number(this.right.percentage) + '%' : '-'}</h6>
					<span class="value">
						<span class="value-right">${this.dates.get(this.right.date) ? this.dates.get(this.right.date).getTypedValue(this.options.valueColumn) : ''}</span><br>
						<small title="${Format.date(this.right.date)}">
							${Format.number(this.options.rightOffset)} day${this.options.rightOffset == '1'? '' : 's'} ago
						</small>
					</span>
				</div>
			`);

			this.right.container = this.container.querySelector('.value-right');
		}

		if(!options.resize) {
			this.animate(options);
		}

		if(this.options.showGraph) {
			this.plotGraph(options);
		}
	}

	animate(options) {

		const
			duration = Page.animationDuration * 2 / 1000,
			jumpsPerSecond = 20,
			jumps = Math.floor(duration * jumpsPerSecond),
			values = {
				center: 0,
				left: 0,
				right: 0,
			};

		const count = jump => {

			if(jump < jumps)
				setTimeout(() => window.requestAnimationFrame(() => count(jump + 1)), duration / jumps);

			for(const position of ['center', 'left', 'right']) {

				if(!this[position] || !this.dates.has(this[position].date)) {
					continue;
				}

				values[position] = (this[position].value / jumps) * jump;

				if(this[position].value % 1 == 0)
					values[position] = Math.floor(values[position]);

				this[position].container.textContent = this.dates.get(this[position].date).getTypedValue(this.options.valueColumn, values[position]);
			}
		};

		count(1);
	}

	plotGraph(options) {

		const margin = {top: 30, right: 30, bottom: 30, left: 30};

		const container = d3.selectAll(`#visualization-${this.id} .graph`);

		container.selectAll('*').remove();

		this.width = this.container.clientWidth - margin.left - margin.right;
		this.height = this.container.clientHeight - margin.top - margin.bottom - 10;

		const
			dates = [...this.dates.values()],
			data = [],
			x = d3.scale.ordinal().rangePoints([0, this.width], 0.1, 0),
			y = d3.scale.linear().range([this.height, 0]),
			valueline = d3.svg.line()
				.x(d => x(d.date))
				.y(d => y(d.value));

		dates.sort((a, b) => Date.parse(a.get(this.options.timingColumn)) - Date.parse(b.get(this.options.timingColumn)));

		for(const row of dates) {
			data.push({
				date: Format.date(row.get(this.options.timingColumn)),
				value: row.get(this.options.valueColumn),
			});
		}

		x.domain(data.map(d => d.date));
		y.domain([d3.min(data, d => d.value), d3.max(data, d => d.value)]);

		const svg = container
			.append('svg')
				.attr('width', this.width + margin.left + margin.right)
				.attr('height', this.height + margin.top + margin.bottom)
			.append('g')
				.attr('transform', `translate(${margin.left}, ${margin.top})`);

		svg.append('path')
			.attr('class', 'line')
			.attr('d', valueline(data))
			.attr('stroke', this.source.columns.get(this.options.valueColumn).color);

		if(!options.resize) {

			const
				path = svg.selectAll('path')[0][0],
				length = path.getTotalLength();

			path.style.strokeDasharray = length + ' ' + length;
			path.style.strokeDashoffset = length;
			path.getBoundingClientRect();

			path.style.transition  = `stroke-dashoffset ${Page.animationDuration}ms ease-in-out`;
			path.style.strokeDashoffset = '0';
		}

		window.addEventListener('resize', () => {

			const
				width = this.container.clientWidth - margin.left - margin.right,
				height = this.container.clientHeight - margin.top - margin.bottom - 10;

			if(this.width != width || this.height != height) {

				this.width = width;
				this.height = height;

				this.plotGraph({resize: true});
			}
		});

		if(!this.options.graphParallax)
			return;

		const graph = this.container.querySelector('.graph');

		this.container.on('mousemove', e => {

			const
				rect = this.container.getBoundingClientRect(),
				x = e.clientX - rect.left,
				y = e.clientY - rect.top,
				parallax = 30,
				valueX = ((x / this.container.clientWidth * parallax) - (parallax / 2)) * -1,
				valueY = ((y / this.container.clientHeight * parallax) - (parallax / 3)) * -1;

			graph.style.transform = `translate(${valueX}px, ${valueY}px)`;
		});

		this.container.on('mouseout', () => graph.removeAttribute('style'));
	}

	getColor(percentage) {

		if(!percentage) {
			return '';
		}

		let color = percentage > 0;

		if(this.invertValues) {
			color = !color;
		}

		return color ? 'green' : 'red';
	}
});

Visualization.list.set('json', class JSONVisualization extends Visualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization', 'json');
		container.innerHTML = `
			<div id="visualization-${this.id}" class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.innerHTML = `<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>`;

		await this.source.fetch(options);

		this.render(options);
	}

	render(options = {}) {

		this.editor = new CodeEditor({mode: 'json'});

		this.editor.value = JSON.stringify(this.source.originalResponse.data, 0, 4);
		this.editor.editor.setReadOnly(true);

		this.container.textContent = null;
		this.container.appendChild(this.editor.container);
	}
});

Visualization.list.set('html', class JSONVisualization extends Visualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const
			container = this.containerElement = document.createElement('div'),
			body = this.options && this.options.body && !this.options.body.includes('{{') ? this.options.body : '';

		container.classList.add('visualization', 'html');

		container.innerHTML = `<div id="visualization-${this.id}" class="container">${body}</div>`;

		if(this.options && this.options.hideHeader) {
			this.source.container.querySelector('header').classList.add('hidden');
		}

		if(this.options && this.options.hideLegend) {
			this.source.container.querySelector('.columns').classList.add('hidden');
		}

		this.source.container.classList.toggle('flush', this.options && this.options.flushBackground);

		return container;
	}

	async load(options = {}) {

		if(this.source.definition && this.source.definition.query && this.options.body && this.options.body.includes('{{')) {
			await this.source.fetch();
		}

		super.render(options);
		await this.render(options);
	}

	async render(options = {}) {

		if(this.options && this.options.hideLegend) {
			this.source.container.querySelector('.columns').classList.add('hidden');
		}

		const [response] = await this.source.response();

		let body = this.options ? this.options.body : '';

		if(!body) {
			body = '';
		}

		for(const [key, value] of response || []) {
			body = body.replace(`{{${key}}}`, response.getTypedValue(key));
		}

		this.container.innerHTML = `<div id="visualization-${this.id}" class="container">${body}</div>`;
	}
});

Visualization.list.set('sankey', class Sankey extends Visualization {

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');
		container.classList.add('visualization', 'sankey');

		container.innerHTML = `
			<div id="visualization-${this.id}" class="container">
				<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>
			</div>
		`;

		return container;
	}

	async load(options = {}) {

		super.render(options);

		this.container.querySelector('.container').innerHTML = `<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>`;

		await this.source.fetch();

		this.response = await this.source.response();

		await this.render(options);
	}

	async render(options = {}) {

		await this.draw();

		if(!this.options) {
			return;
		}

		if(!this.options.sourceColumn || !this.options.targetColumn || !this.options.valueColumn) {
			return;
		}

		await this.plot(options);
	}

	async draw() {

		if(!this.options) {
			return this.source.error('Visualization configuration not set.');
		}

		if(!this.options.sourceColumn) {
			return this.source.error('Source column not selected.');
		}

		if(!this.options.targetColumn) {
			return this.source.error('Target column not selected.');
		}

		if(!this.options.valueColumn) {
			return this.source.error('Value column not selected.');
		}

		if(this.options.sourceColumn == this.options.targetColumn) {
			return this.source.error('Source and Target columns are same');
		}

		const response = await this.response;

		if(response && response.length) {

			if(!response[0].has(this.options.sourceColumn)) {
				return this.source.error(`Timing column '${this.options.sourceColumn}' not found.`);
			}

			if(!response[0].has(this.options.targetColumn)) {
				return this.source.error(`Timing column '${this.options.targetColumn}' not found.`);
			}

			if(!response[0].has(this.options.valueColumn)) {
				return this.source.error(`Value column '${this.options.valueColumn}' not found.`);
			}
		}

		window.addEventListener('resize', () => {

			const
				height = this.container.clientHeight - 20,
				width = this.container.clientWidth - 20;

			if(this.width != width || this.height != height) {
				this.render({resize: true});
			}
		});
	}

	cycleDetection() {

		const
			response = this.response,
			sourceTargetMap = new Map;

		for(const data of response) {

			if(!sourceTargetMap.has(data.get(this.options.sourceColumn))) {
				sourceTargetMap.set(data.get(this.options.sourceColumn), new Set);
			}

			sourceTargetMap.get(data.get(this.options.sourceColumn)).add(data.get(this.options.targetColumn))
		}

		const that = this;

		let cyclePresent = false;

		for(const [key, value] of sourceTargetMap) {

			cyclePresent = cycle(key, value, key)

			if(cyclePresent) {
				break;
			}
		}

		function cycle(key, value, source) {

			if(!value) {
				return false;
			}

			const valueArray = Array.from(value);

			if(valueArray.includes(source)) {
				throw that.source.error('Circular data present.');
			}

			let x = false;

			for(const data of valueArray) {
				x = cycle(data, sourceTargetMap.get(data), source)
			}

			return x;
		}

		return cyclePresent;
	}

	async plot(options = {}) {

		this.cycleDetection();

		this.sankey();

		if(isNaN(this.response[0].get(this.options.valueColumn))) {
			return this.source.error('Value is not a number');
		}

		const nodeMap = {};

		for(const data of this.response) {

			if(!(data.get(this.options.sourceColumn) in nodeMap)) {
				nodeMap[data.get(this.options.sourceColumn)] = {name: data.get(this.options.sourceColumn)};
			}

			if(!(data.get(this.options.targetColumn) in nodeMap)) {
				nodeMap[data.get(this.options.targetColumn)] = {name: data.get(this.options.targetColumn)};
			}
		}

		let links = [];

		links = this.response.map(x => {
			return {
				source: nodeMap[x.get(this.options.sourceColumn)],
				target: nodeMap[x.get(this.options.targetColumn)],
				value: x.get(this.options.valueColumn),
			};
		});

		const margin = {top: 30, right: 30, bottom: 30, left: 30};

		const container = d3.selectAll(`#visualization-${this.id}`);

		const format = d => `${d3.format(',.0f')(d)} Units`;

		container.selectAll('*').remove();

		if(!this.width || options.resize) {
			this.width = this.container.clientWidth - margin.left - margin.right;
			this.height = this.container.clientHeight - margin.top - margin.bottom - 10;
		}

		const svg = container.append('svg')
			.attr('width', this.width + margin.left + margin.right)
			.attr('height', this.height + margin.top + margin.bottom)
			.append('g')
			.attr('transform', `translate(${margin.left} , ${margin.top})`);

		const nodeWidth = this.width % 30 < 20 ? 20 : this.width % 30;

		const sankey = d3.sankey()
			.nodeWidth(nodeWidth)
			.nodePadding(10)
			.size([this.width, this.height]);

		const path = sankey.link();

		sankey
			.nodes(Object.values(nodeMap))
			.links(links)
			.layout(32);

		const link = svg.append('g')
			.selectAll('.link')
			.data(links)
			.enter()
			.append('path')
			.attr('class', 'link')
			.attr('d', path)
			.style('stroke-width', d => Math.max(1, d.dy))
			.sort((a, b) => b.dy - a.dy);

		const that = this;

		let
			mouse,
			content;

		container
			.on('mousemove', function(d) {

				if(that.options.hideTooltip || !content)
					return;

				mouse = d3.mouse(this);

				const contentContainer = `<div class="sankey-tooltip">${content}</div>`;

				if(that.container.querySelector('.loading')) {
					return;
				}

				Tooltip.show(that.container, mouse, contentContainer);
			})
			.on('mouseleave', () => Tooltip.hide(that.container));

		link
			.on('mouseenter', function(d) {

				content = `${d.source.name} to ${d.target.name} : ${format(d.value)}`;
			})
			.on('mouseleave' , function(d) {

				content = null;
				Tooltip.hide(that.container);
			});

		const node = svg.append('g')
				.selectAll('.node')
				.data(Object.values(nodeMap))
				.enter()
				.append('g')
				.attr('class', 'node')
				.attr('transform', d => `translate(${d.x} , ${ d.y})`);

		node.append('rect')
			.attr('height', d => d.dy)
			.attr('width', sankey.nodeWidth())
			.style('fill', d => DataSourceColumn.colors[Object.keys(nodeMap).indexOf(d.name) % DataSourceColumn.colors.length])
			.on('mouseenter', function(d) {

				content = `${d.name} ${format(d.value)}`;
			})
			.on('mouseleave' , function(d) {

				content = null;
				Tooltip.hide(that.container);
			});

		const width = this.width;

		node.append('text')
			.attr('x', -6)
			.attr('y', d => d.dy / 2)
			.attr('dy', '.35em')
			.attr('text-anchor', 'end')
			.attr('transform', null)
			.text(d => d.name)
		.filter(d => d.x <= width / 2)
			.attr('x', 6 + sankey.nodeWidth())
			.attr('text-anchor', 'start');
	}

	sankey() {

		if(d3.sankey) {
			return;
		}

		d3.sankey = function() {
			let
				sankey = {},
				nodeWidth = 24,
				nodePadding = 8,
				size = [1, 1],
				nodes = [],
				links = [];

			sankey.nodeWidth = function(_) {

				if(!arguments.length) {
					return nodeWidth;
				}

				nodeWidth = +_;

				return sankey;
			};

			sankey.nodePadding = function(_) {

				if(!arguments.length) {
					return nodePadding;
				}

				nodePadding = +_;
				return sankey;
			};

			sankey.nodes = function(_) {

				if(!arguments.length) {
					return nodes;
				}

				nodes = _;

				return sankey;
			};

			sankey.links = function(_) {

				if(!arguments.length) {
					return links;
				}

				links = _;

				return sankey;
			};

			sankey.size = function(_) {

				if(!arguments.length) {
					return size;
				}

				size = _;
				return sankey;
			};

			sankey.layout = function(iterations) {

				computeNodeLinks();
				computeNodeValues();
				computeNodeBreadths();
				computeNodeDepths(iterations);
				computeLinkDepths();
				return sankey;
			};

			sankey.relayout = function() {

				computeLinkDepths();
				return sankey;
			};

			sankey.link = function() {

				let curvature = .5;

				function link(d) {

					let
						x0 = d.source.x + d.source.dx,
						x1 = d.target.x,
						xi = d3.interpolateNumber(x0, x1),
						x2 = xi(curvature),
						x3 = xi(1 - curvature),
						y0 = d.source.y + d.sy + d.dy / 2,
						y1 = d.target.y + d.ty + d.dy / 2;

					return `M ${x0} , ${y0}
							  C ${x2} , ${y0}
							  ${x3} , ${y1}
							  ${x1} , ${y1}`;
				}

				link.curvature = function(_) {

					if(!arguments.length) {
						return curvature;
					}

					curvature = +_;
					return link;
				};

				return link;
			};

			// Populate the sourceLinks and targetLinks for each node.
			// Also, if the source and target are not objects, assume they are indices.
			function computeNodeLinks() {

				for(const node of nodes) {

					node.sourceLinks = [];
					node.targetLinks = [];
				}

				for(const link of links) {

					let
						source = link.source,
						target = link.target;

					if(typeof source === 'number') {
						source = link.source = nodes[link.source];
					}

					if(typeof target === 'number') {
						target = link.target = nodes[link.target];
					}

					source.sourceLinks.push(link);
					target.targetLinks.push(link);
				};
			}

			// Compute the value (size) of each node by summing the associated links.
			function computeNodeValues() {

				for(const node of nodes) {

					node.value = Math.max(
						d3.sum(node.sourceLinks, value),
						d3.sum(node.targetLinks, value)
					);
				}
			}

			// Iteratively assign the breadth (x-position) for each node.
			// Nodes are assigned the maximum breadth of incoming neighbors plus one;
			// nodes with no incoming links are assigned breadth zero, while
			// nodes with no outgoing links are assigned the maximum breadth.

			function computeNodeBreadths() {

				let
					remainingNodes = nodes,
					nextNodes,
					x = 0;

				while(remainingNodes.length) {

					nextNodes = [];

					for(const node of remainingNodes) {

						node.x = x;
						node.dx = nodeWidth;

						for(const link of node.sourceLinks) {
							nextNodes.push(link.target);
						}
					}

					remainingNodes = nextNodes;
					++x;
				}

				moveSinksRight(x);
				scaleNodeBreadths((size[0] - nodeWidth) / (x - 1));
			}

			function moveSourcesRight() {

				for(const node of nodes) {

					if(!node.targetLinks.length) {
						node.x = d3.min(node.sourceLinks, d => d.target.x) - 1;
					}
				};
			}

			function moveSinksRight(x) {

				for(const node of nodes) {

					if(!node.sourceLinks.length) {
						node.x = x - 1;
					}
				};
			}

			function scaleNodeBreadths(kx) {

				for(const node of nodes) {
					node.x *= kx;
				}
			}

			function computeNodeDepths(iterations) {

				let nodesByBreadth = d3.nest()
						.key(d => d.x)
						.sortKeys(d3.ascending)
						.entries(nodes)
						.map(d => d.values);

				initializeNodeDepth();
				resolveCollisions();

				for (let alpha = 1; iterations > 0; --iterations) {

					relaxRightToLeft(alpha *= .99);
					resolveCollisions();
					relaxLeftToRight(alpha);
					resolveCollisions();
				}

				function initializeNodeDepth() {

					let ky = d3.min(nodesByBreadth, function(nodes) {
						return (size[1] - (nodes.length - 1) * nodePadding) / d3.sum(nodes, value);
					});

					for(const nodes of nodesByBreadth) {

						for(const [i, node] of nodes.entries()) {

							node.y = i;
							node.dy = node.value * ky;
						}
					}

					for(const link of links) {

						link.dy = link.value * ky;
					}
				}

				function relaxLeftToRight(alpha) {

					for(const [breadth, nodes] of nodesByBreadth.entries()) {

						for(const node of nodes) {

							if(node.targetLinks.length) {
								let y = d3.sum(node.targetLinks, weightedSource) / d3.sum(node.targetLinks, value);
								node.y += (y - center(node)) * alpha;
							}
						}
					}

					function weightedSource(link) {
						return center(link.source) * link.value;
					}
				}

				function relaxRightToLeft(alpha) {

					for(const nodes of nodesByBreadth.slice().reverse()) {

						for(const node of nodes) {

							if(node.sourceLinks.length) {
								let y = d3.sum(node.sourceLinks, weightedTarget) / d3.sum(node.sourceLinks, value);
								node.y += (y - center(node)) * alpha;
							}
						}
					}

					function weightedTarget(link) {
						return center(link.target) * link.value;
					}
				}

				function resolveCollisions() {

					for(const nodes of nodesByBreadth) {

						let
							node,
							dy,
							y0 = 0,
							n = nodes.length,
							i;

						// Push any overlapping nodes down.
						nodes.sort(ascendingDepth);

						for (i = 0; i < n; ++i) {
							node = nodes[i];
							dy = y0 - node.y;
							if (dy > 0) node.y += dy;
							y0 = node.y + node.dy + nodePadding;
						}

						// If the bottommost node goes outside the bounds, push it back up.
						dy = y0 - nodePadding - size[1];

						if (dy > 0) {
							y0 = node.y -= dy;

							// Push any overlapping nodes back up.
							for (i = n - 2; i >= 0; --i) {
								node = nodes[i];
								dy = node.y + node.dy + nodePadding - y0;
								if (dy > 0) node.y -= dy;
								y0 = node.y;
							}
						}
					};
				}

				function ascendingDepth(a, b) {
					return a.y - b.y;
				}
			}

			function computeLinkDepths() {

				for(const node of nodes) {

					node.sourceLinks.sort(ascendingTargetDepth);
					node.targetLinks.sort(ascendingSourceDepth);
				}

				for(const node of nodes) {

					let sy = 0, ty = 0;

					for(const link of node.sourceLinks) {

						link.sy = sy;
						sy += link.dy;
					}

					for(const link of node.targetLinks) {

						link.ty = ty;
						ty += link.dy;
					}
				}

				function ascendingSourceDepth(a, b) {
					return a.source.y - b.source.y;
				}

				function ascendingTargetDepth(a, b) {
					return a.target.y - b.target.y;
				}
			}

			function center(node) {
				return node.y + node.dy / 2;
			}

			function value(link) {
				return link.value;
			}

			return sankey;
		}
	}
});

class SpatialMapLayers extends Set {

	constructor(layers, visualization) {

		super();

		this.visualization = visualization;
		this.visible =  new Set();

		for(const layer of layers) {

			this.add(new (SpatialMapLayer.types.get(layer.type))(layer, this));
		}
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('columns-toggle');

		container.innerHTML = `
			<div class="columns hidden"></div>
			<span class="arrow up" title="Plotted Layers"><i class="fas fa-angle-up"></i></span>
			<span class="arrow down hidden" title="Collapse"><i class="fas fa-angle-down"></i></span>
		`;

		container.on('click', () => {

			container.querySelector('.arrow.up').classList.toggle('hidden');
			container.querySelector('.arrow.down').classList.toggle('hidden');
			container.querySelector('.columns').classList.toggle('hidden');
		});

		for(const layer of this.values()) {

			this.visible.add(layer);
			container.querySelector('.columns').appendChild(layer.container);
		}

		return container;
	}

	render() {

		for(const layer of this.values()) {

			if(!layer.latitudeColumn) {
				return this.visualization.source.error('Latitude Column not defined.');
			}

			if(!this.visualization.source.columns.has(layer.latitudeColumn)) {
				return this.visualization.source.error(`Latitude Column '${layer.latitudeColumn}' not found.`);
			}

			if(!layer.longitudeColumn) {
				return this.visualization.source.error('Longitude Column not defined.');
			}

			if(!this.visualization.source.columns.has(layer.longitudeColumn)) {
				return this.visualization.source.error(`Longitude Column '${layer.longitudeColumn}' not found.`);
			}

			this.visible.has(layer) ? layer.plot() : layer.clear();
		}
	}
}

class SpatialMapLayer {

	constructor(layer, layers) {

		Object.assign(this, layer);

		this.layers = layers;
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('label');

		container.classList.add('column');

		container.innerHTML = `
			<span class="name">${this.layer_name} <span class="type">${this.type}</span></span>
			<input type="checkbox" name="visible_layers" checked>
		`;

		container.on('click', e => e.stopPropagation());

		const visibleCheck = container.querySelector('input[name=visible_layers]');

		visibleCheck.on('change', e => {

			container.classList.toggle('disabled');

			if(visibleCheck.checked) {
				this.layers.visible.add(this);
			}
			else {
				this.layers.visible.delete(this);
			}

			this.layers.render();
		});

		return container;
	}
}

SpatialMapLayer.types = new Map();

SpatialMapLayer.types.set('heatmap', class HeatMap extends SpatialMapLayer {

	constructor(layer, layers) {

		super(layer, layers);

		[this.gradient] = HeatMap.gradient.filter(x => x.name == (this.gradient || 'Standard'));

		this.heatmap = new google.maps.visualization.HeatmapLayer({
			radius: this.radius || 15,
			opacity: this.opacity || 0.6,
			gradient: this.gradient.color_code,
		});
	}

	static get gradient() {

		return [
			{
				name: 'Standard',
				color_code: [
					'rgba(102, 255, 0, 0)',
					'rgba(102, 255, 0, 1)',
					'rgba(147, 255, 0, 1)',
					'rgba(193, 255, 0, 1)',
					'rgba(238, 255, 0, 1)',
					'rgba(244, 227, 0, 1)',
					'rgba(249, 198, 0, 1)',
					'rgba(255, 170, 0, 1)',
					'rgba(255, 113, 0, 1)',
					'rgba(255, 57, 0, 1)',
					'rgba(255, 0, 0, 1)',
				],
			},
			{
				name: 'Blue',
				color_code: [
					'rgba(0, 255, 255, 0)',
					'rgba(0, 255, 255, 1)',
					'rgba(0, 191, 255, 1)',
					'rgba(0, 127, 255, 1)',
					'rgba(0, 63, 255, 1)',
					'rgba(0, 0, 255, 1)',
					'rgba(0, 0, 223, 1)',
					'rgba(0, 0, 191, 1)',
					'rgba(0, 0, 159, 1)',
					'rgba(0, 0, 127, 1)',
					'rgba(63, 0, 91, 1)',
					'rgba(127, 0, 63, 1)',
					'rgba(191, 0, 31, 1)',
					'rgba(255, 0, 0, 1)',
				],
			},
		];
	}

	plot() {

		this.heatmap.setData(this.markers);

		if(!this.heatmap.getMap()) {

			this.heatmap.setMap(this.layers.visualization.map);
		}
	}

	clear() {

		this.heatmap.setMap(null);
	}

	get markers() {

		const markers = [];

		for(const row of this.layers.visualization.rows) {

			if(this.weightColumn) {

				markers.push({
					location: new google.maps.LatLng(parseFloat(row.get(this.latitudeColumn)), parseFloat(row.get(this.longitudeColumn))),
					weight: parseFloat(row.get(this.weightColumn))
				});

				continue;
			}

			markers.push(
				new google.maps.LatLng(parseFloat(row.get(this.latitudeColumn)), parseFloat(row.get(this.longitudeColumn)))
			);
		}

		return markers
	}
});

SpatialMapLayer.types.set('clustermap', class ClusterMap extends SpatialMapLayer {

	plot() {

		if(this.clusterer) {

			this.clusterer.clearMarkers();
			this.clusterer.addMarkers(this.markers);

			return;
		}

		this.clusterer = new MarkerClusterer(this.layers.visualization.map, this.markers, { imagePath: 'https://raw.githubusercontent.com/googlemaps/js-marker-clusterer/gh-pages/images/m' });
	}

	clear() {

		if(this.clusterer) {

			this.clusterer.clearMarkers();
			this.clusterer = null;
		}
	}

	get markers() {

		const markers = [];

		for(const row of this.layers.visualization.rows) {
			markers.push(
				new google.maps.Marker({
					position: {
						lat: parseFloat(row.get(this.latitudeColumn)),
						lng: parseFloat(row.get(this.longitudeColumn)),
					},
				})
			);
		}

		return markers;
	}
});

SpatialMapLayer.types.set('scattermap', class ScatterMap extends SpatialMapLayer {

	plot() {

		const map = this.markers[0].getMap();

		for(const marker of this.markers) {

			if(!map) {
				marker.setMap(this.layers.visualization.map);
			}
		}
	}

	clear() {

		for(const marker of this.markers) {
			marker.setMap(null);
		}
	}

	get markers() {

		const markers = this.existingMarkers = [];

		const
			markerColor = ['red', 'blue', 'green', 'orange', 'pink', 'yellow', 'purple'],
			urlPrefix = 'http://maps.google.com/mapfiles/ms/icons/';

		let uniqueFields = [];

		if(this.colorColumn) {

			uniqueFields = this.layers.visualization.rows.map(x => x.get(this.colorColumn));
			uniqueFields = Array.from(new Set(uniqueFields));
		}

		for(const row of this.layers.visualization.rows) {

			const infoContent = `
				<div>
					<table style="border: none;">
						<tr>
							<td>${this.colorColumn.slice(0, 1).toUpperCase() + this.colorColumn.slice(1)}</td>
							<td>${row.get(this.colorColumn) || ''}</td>
						</tr>
					</table>
					<hr>
					<span style="color: #888">Latitude: ${row.get(this.latitudeColumn)}, Longitude: ${row.get(this.longitudeColumn)}</span>
				</div>
			`;

			let infoPopUp;

			const markerObj = new google.maps.Marker({
				position: {
					lat: parseFloat(row.get(this.latitudeColumn)),
					lng: parseFloat(row.get(this.longitudeColumn)),
				},
				icon: urlPrefix + (markerColor[uniqueFields.indexOf(row.get(this.colorColumn)) % markerColor.length] || 'red') + '-dot.png',
			});

			markerObj.addListener('mouseover', () => {

				infoPopUp = new google.maps.InfoWindow({
					content: infoContent
				});

				infoPopUp.open(this.layers.visualization.map, markerObj);
			});

			markerObj.addListener('mouseout', () => {

				if(infoPopUp) {

					infoPopUp.close();
				}
			});

			markers.push(markerObj);
		}

		return markers;
	}
});

SpatialMapLayer.types.set('bubblemap', class BubbleMap extends SpatialMapLayer {

	plot() {

		const map = this.markers[0].getMap();

		for(const marker of this.markers) {

			if(!map) {
				marker.setMap(this.layers.visualization.map);
			}
		}
	}

	clear() {

		for(const marker of this.markers) {
			marker.setMap(null);
		}
	}

	get markers() {

		const
			markers = this.existingMarkers = [],
			possibleRadiusValues = this.layers.visualization.rows.map(x => parseFloat(x.get(this.radiusColumn))),
			range = {
				source: {
					min: Math.min(...possibleRadiusValues),
					max: Math.max(...possibleRadiusValues),
				},
				target: {
					min: 100,
					max: 2000000,
				},
			};

		let uniqueFields = [];

		if(this.colorColumn) {

			uniqueFields = this.layers.visualization.rows.map(x => x.get(this.colorColumn));
			uniqueFields = Array.from(new Set(uniqueFields));
		}

		for(const row of this.layers.visualization.rows) {

			const markerRadius = parseFloat(row.get(this.radiusColumn));

			if(!markerRadius && markerRadius != 0) {
				return this.layers.visualization.source.error('Radius column must contain numerical values');
			}

			const color = DataSourceColumn.colors[uniqueFields.indexOf(row.get(this.colorColumn)) % DataSourceColumn.colors.length] || DataSourceColumn.colors[0];

			markers.push(new google.maps.Circle({
				radius: (((markerRadius - range.source.min) / range.source.max) * (range.target.max - range.target.min)) + range.target.min,
				center: {
					lat: parseFloat(row.get(this.latitudeColumn)),
					lng: parseFloat(row.get(this.longitudeColumn)),
				},
				strokeColor: color,
				strokeOpacity: 0.8,
				strokeWeight: 2,
				fillColor: color,
				fillOpacity: 0.35,
			}));
		}

		return markers;
	}
});

Visualization.list.set('calendar', class CalendarVisualization extends Visualization {

	constructor(visualization, source) {

		super(visualization, source);

		this.constraints = {

			min: Infinity,
			max: -Infinity,
			monthMin: Infinity,
			monthMax: -Infinity,
			yearMin: Infinity,
			yearMax: -Infinity,
			weekMin: Infinity,
			weekMax: -Infinity,
		};

		// luminosity less than this.darLuma indicates that container is dark.
		//alpha value btween 0-255, more this.darkAlphaValue means background is more opaque.
		this.darkLuma = 60;
		this.darkAlphaValue = 100;
	}

	async load(options = {}) {

		super.render(options);

		await this.source.fetch(options);

		if (!this.unset) {
			await this.render(options);
		}
	}

	async process(options = {}) {

		if(!this.options) {
			this.options = options;
		}

		this.constraints = {

			min: Infinity,
			max: -Infinity,
			monthMin: Infinity,
			monthMax: -Infinity,
			yearMin: Infinity,
			yearMax: -Infinity,
			weekMin: Infinity,
			weekMax: -Infinity,
		}

		const response = await this.source.response();

		this.response = response;
		this.timingMappedResponse = new Map;
		this.hierarchy = new Map;

		if (!this.options) {

			this.unset = true;
			return this.source.error('Visualization not configured yet.');
		}

		if (!response || !response.length) {

			this.unset = true;
			return this.source.error('No Data Found');
		}

		if (!this.options.timingColumn) {

			this.unset = true;
			return this.source.error('Timing Column not defined.');
		}

		if (!this.options.valueColumn) {

			this.unset = true;
			return this.source.error('Value Column not defined.');
		}

		if (!this.source.columns.list.has(this.options.timingColumn)) {

			this.unset = true;
			return this.source.error(`Timing Column ${this.options.timingColumn} not found`);
		}

		if (!this.source.columns.list.has(this.options.valueColumn)) {

			this.unset = true;
			return this.source.error(`Value Column ${this.options.valueColumn} not found`);
		}

		if (this.options.valueColumn == this.options.timingColumn) {

			this.unset = true;
			return this.source.error(`Value Column should not be equal to timing column`);
		}

		this.unset = false;

		this.reset();

		switch ((this.source.columns.get(this.options.timingColumn).type || {name: 'string'}).name) {

			case 'string':
				break;

			case 'date':
				break;

			case 'month':
				this.collapsed = 'monthly';
				break;
		}

		if (this.source.postProcessors.selected
			&& ['CollapseTo', 'CollapseToAverage'].includes(this.source.postProcessors.selected.key)
			&& this.source.postProcessors.selected.value == 'week') {

			this.collapsed = 'weekly';
		}

		this.timingMappedString();
	}

	reset() {

		this.collapsed = false;
	}

	get container() {

		if (this.containerElement) {

			return this.containerElement;
		}

		this.containerElement = document.createElement('div');
		this.container.classList.add('calendar', 'visualization');
		this.container.id = `visualization-${this.id}`;

		if (this.options && this.options.orientation == 'vertical') {

			this.container.classList.add('vertical');
		}


		return this.containerElement;
	}

	async render() {

		const container = this.container;
		container.textContent = null;

		await this.process();

		if (this.unset) {

			return false;
		}

		for (const year of this.hierarchy.values()) {

			const yearObject = new CalendarYear(year, this.source);
			container.appendChild(yearObject.container);

			if (this.collapsed == 'weekly') {

				break;
			}
		}

		return container;
	}

	alphaValue(min, max, value, empty, invert = false) {

		const
			range = max - min,
			baseValue = 50,
			remainingGradient = 255 - baseValue,
			distance = invert ? max - value : value - min
		;

		let alphaValue;

		if (empty) {

			alphaValue = baseValue;
		}

		else {

			alphaValue = baseValue + (remainingGradient / range) * distance;
		}

		return Math.floor(alphaValue).toString(16);
	}

	timingMappedString() {

		let l = this.response.length;

		while (l--) {

			if (!this.response[l].has(this.options.timingColumn) && !this.response[l].has(this.options.valueColumn)) {

				this.response.splice(l, 1);
				continue;
			}

			this.response[l].set(this.options.timingColumn,
				this.response[l]
					.get(this.options.timingColumn)
					.slice(0, 10)
					.split('-')
					.concat(['-01', '-01'])
					.slice(0, 3)
					.join('-')
			);

			let timing = new Date(this.response[l].get(this.options.timingColumn));

			timing = new Date(+timing - (timing.getTimezoneOffset() * 60000));

			this.response[l].set(this.options.timingColumn, timing); //current timezone

			this.timingMappedResponse.set(this.response[l].get(this.options.timingColumn).toISOString().slice(0, 10),
				this.collapsed == 'weekly' ? new CalendarWeek(this.response[l], this.source) : new CalendarDay(this.response[l], this.source)
			);
		}

		for (const date of this.timingMappedResponse.keys()) {

			const timing = date.split('-');

			if (!this.hierarchy.has(timing[0])) {

				this.hierarchy.set(timing[0], new Map);
			}

			if (!(this.hierarchy.get(timing[0])).has(timing[1])) {

				this.hierarchy.get(timing[0]).set(timing[1], []);
			}

			this.hierarchy.get(timing[0]).get(timing[1]).push(this.timingMappedResponse.get(date));
		}
	}

	luma(c) {

		c = c.substring(1, 7);
		const
			rgb = parseInt(c, 16),
			r = (rgb >> 16) & 0xff,
			g = (rgb >> 8) & 0xff,
			b = (rgb >> 0) & 0xff
		;

		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}

	fillDiv(div, obj) {

		switch (this.options.cellValue) {

			case 'blank':
				div.innerHTML = '&nbsp';
				break;

			case 'timing':
				div.innerHTML = obj.name;
				break;

			case 'value':
				div.innerHTML = obj.typedValue;
				break;

			case 'both':

				div.innerHTML = `
					<span>
						${obj.name}
					</span>

					<span class="${obj.dark ? 'dark' : 'light'} value-subtitle">
						${obj.typedValue ? obj.typedValue : ''}
					</span>`;

				break;

			default:
				div.innerHTML = obj.name;

		}
	}
});

class CalendarUnit {

	constructor(row, source) {

		this.source = source;
		this.visualization = this.source.visualizations.selected;
		this.row = row;

		if (!(this.row.get(this.visualization.options.timingColumn) instanceof Date)) {

			this.row.set(this.visualization.options.timingColumn,
				new Date(this.row.get(this.visualization.options.timingColumn)
					.split('-')
					.push('-01', '-01')
					.slice(0, 3)
				)
			);

			this.blank = true;
		}

		if (!this.row.get(this.visualization.options.valueColumn)) {

			this.empty = true;
		}

		this.timing = this.row.get(this.visualization.options.timingColumn);
		this.value = this.row.get(this.visualization.options.valueColumn);

		this.name = this.timing.getDate();
	}

	get container() {

		if (this.containerElement) {

			return this.containerElement;
		}

		this.setup();

		const columnColor = this.source.columns.get(this.visualization.options.timingColumn).color;

		const div = document.createElement('div');

		div.classList.add('calendar-day');

		if (this.blank || this.empty) {

			div.classList.add('blank');
		}

		else {

			div.style.backgroundColor = columnColor + this.alphaValue;

			if(!['value', 'both'].includes(this.visualization.options.cellValue)) {

				div.setAttribute('data-tooltip', this.toolTipValue);

				if (this.bottomTooltip) {

					div.setAttribute('data-tooltip-position', 'bottom');
				}
			}
		}

		if (this.visualization.luma(columnColor) <= this.visualization.darkLuma
			&& parseInt(this.alphaValue, 16) > this.visualization.darkAlphaValue
		) {
			div.classList.add('dark');
			this.dark = true;
		}

		else {

			div.classList.add('light');
			this.light = true;
		}

		this.visualization.fillDiv(div, Object.assign({}, this));

		this.containerElement = div;

		return this.containerElement;
	}
}

class CalendarDay extends CalendarUnit {

	constructor(row, visualization) {

		super(row, visualization);

		this.visualization.constraints.max = Math.max(this.value, this.visualization.constraints.max)
		this.visualization.constraints.min = Math.min(this.value, this.visualization.constraints.min);
	}

	setup() {

		this.alphaValue = this.visualization.alphaValue(
			this.visualization.constraints.min,
			this.visualization.constraints.max,
			this.value,
			this.empty,
			this.visualization.options.invertValues
		);

		this.toolTipValue = this.row.getTypedValue(this.visualization.options.valueColumn);
		this.typedValue = this.row.getTypedValue(this.visualization.options.valueColumn) || '&nbsp';
	}
}

class CalendarWeek extends CalendarUnit {

	constructor(row, source) {

		super(row, source);

		this.name = Format.date(this.timing.toISOString().slice(0, 10));

		let endDate = new Date(this.timing);
		endDate = new Date(endDate.setDate(endDate.getDate() + 6));

		this.visualization.constraints.weekMax = Math.max(this.value, this.visualization.constraints.weekMax);
		this.visualization.constraints.weekMin = Math.min(this.value, this.visualization.constraints.weekMin);

		this.dateRange = `${Format.date(this.timing.toISOString().slice(0, 10))} - ${Format.date(endDate.toISOString().slice(0, 10))}`
	}

	setup() {

		this.alphaValue = this.visualization.alphaValue(
			this.visualization.constraints.weekMin,
			this.visualization.constraints.weekMax,
			this.value,
			this.empty,
			this.visualization.options.invertValues
		);

		this.toolTipValue = `${this.row.getTypedValue(this.visualization.options.valueColumn)} \n ${this.dateRange}`;
		this.typedValue = this.row.getTypedValue(this.visualization.options.valueColumn);
	}
}

class CalendarMonth {

	constructor(dates, source) {

		this.source = source;
		this.visualization = this.source.visualizations.selected;

		this.dates = dates;

		this.empty = !dates.length;

		const sdate = dates[0].timing;

		if (this.visualization.collapsed != 'monthly') {

			this.value = dates.reduce((val, x) => {

				if (x.value) {

					return val + parseFloat(x.value)
				}

				return 0;

			}, 0);
		}

		else {

			this.value = dates[0] && dates[0].value;
			this.typedValue = dates[0] ? dates[0].row.getTypedValue(this.visualization.options.valueColumn) : '&nbsp';
		}

		this.visualization.constraints.monthMax = Math.max(this.value, this.visualization.constraints.monthMax);
		this.visualization.constraints.monthMin = Math.min(this.value, this.visualization.constraints.monthMin);

		this.name = `${Format.customTime(sdate, {month: "long"})} (${sdate.getFullYear()})`;

		const firstDay = new Date(sdate.getFullYear(), sdate.getMonth(), 1);
		const lastDay = new Date(sdate.getFullYear(), sdate.getMonth() + 1, 0);

		let timing = new Date(+firstDay - (firstDay.getTimezoneOffset() * 60000));

		timing.setHours(0, 0, 0, 0);

		while (timing <= lastDay) {

			if (!this.visualization.timingMappedResponse.has(new Date(+timing - (timing.getTimezoneOffset() * 60000))
				.toISOString().slice(0, 10))) {

				const row = {};
				row[this.visualization.options.timingColumn] = timing;
				row[this.visualization.options.valueColumn] = '';
				const dataSourceRow = new DataSourceRow(row, this.source);

				this.dates.push(new CalendarDay(dataSourceRow, this.source));

				this.visualization.timingMappedResponse.set(
					new Date(+timing - (timing.getTimezoneOffset() * 60000))
						.toISOString()
						.slice(0, 10),
					new CalendarDay(dataSourceRow, this.source)
				);
			}

			timing = new Date(+timing + 60 * 60 * 24 * 1000);
		}

		this.dates = this.dates.sort((x, y) => {

			if (x.timing < y.timing) {

				return -1;
			}

			else if (x.timing > y.timing) {

				return 1;
			}

			return 0;
		});
	}

	get container() {

		if (this.containerElement) {

			return this.containerElement;
		}

		const weeks = [];
		let week = Array(7).fill(null);

		for (const date of this.dates) {

			this.data ? this.data += date.data : this.data = date.data;

			if (date.timing.getDay() == 0) {

				week.filter(x => x).length && weeks.push(week);
				week = Array(7).fill(null);
			}

			week[date.timing.getDay()] = date;
		}

		week.filter(x => x).length && weeks.push(week);

		const container = document.createElement('section');

		container.innerHTML = `
			<div>
				<h1 class="month-name">${this.name}</h1>
				<div class="calendar-grid calendar-container"></div>
			</div>
		`;

		container.classList.add('calendar-month');

		const calendarDaysContainer = container.querySelector('.calendar-container');

		const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat'];

		for (const week of weekDays) {

			calendarDaysContainer.insertAdjacentHTML('beforeend', `<div class="calendar-day weekday">${week}</div>`);
		}

		for (const week of weeks) {

			for (const day of week) {

				if (!day) {

					calendarDaysContainer.insertAdjacentHTML('beforeend', `<div class="blank"></div>`);
					continue;
				}

				calendarDaysContainer.appendChild(day.container);
			}
		}

		this.containerElement = container;

		return this.containerElement;
	}

	get collapsedContainer() {

		const div = document.createElement('div');
		div.classList.add('calendar-day');

		const maxYear = (([...this.visualization.hierarchy.keys()].map(x => x.split('-')[0])).sort()).pop();

		if (
			(this.name.includes(maxYear)
				&& !(this.visualization.options.orientation == 'vertical-stretched')
			) ||
			(this.visualization.options.orientation == 'vertical-stretched'
				&& new Date(this.dates[0].timing).getMonth() === 0
			)
		) {

			div.setAttribute('data-tooltip-position', 'bottom');
		}

		if(!['value', 'both'].includes(this.visualization.options.cellValue)) {

			div.setAttribute('data-tooltip', this.typedValue);
		}

		div.textContent = this.name;

		const alphaValue = this.visualization.alphaValue(
			this.visualization.constraints.monthMin,
			this.visualization.constraints.monthMax,
			this.value,
			this.empty,
			this.visualization.options.invertValues
		);

		div.style.backgroundColor = this.visualization.source.columns.get(this.visualization.options.timingColumn).color + alphaValue;
		div.style.height = '100px';

		if (this.visualization.luma(this.source.columns.get(this.visualization.options.timingColumn).color) <= 40
			&& parseInt(alphaValue, 16) > 170) {

			div.classList.add('dark');
			this.dark = true
		}

		else {

			div.classList.add('light');
			this.light = true;
		}

		this.visualization.fillDiv(div, Object.assign({}, this));

		return div;
	}
}

class CalendarYear {

	constructor(months, source) {

		this.source = source;
		this.visualization = this.source.visualizations.selected;

		this.monthMapping = new Map;

		if (this.visualization.collapsed == 'weekly') {

			return;
		}

		for (const month of months.keys()) {

			this.monthMapping.set(month, new CalendarMonth(months.get(month), this.source));
		}
	}

	get container() {

		if (this.containerElement) {

			return this.containerElement;
		}

		if (this.visualization.collapsed == 'weekly') {

			return this.containerCollapsed;
		}

		const yearContainer = document.createElement('div');

		if (this.visualization.options.orientation == 'vertical') {

			if(this.visualization.collapsed == 'monthly') {

				yearContainer.classList.add('vertical-month-grid');
			}

			else {

				yearContainer.classList.add('vertical');
			}
		}

		else if (this.visualization.options.orientation == 'horizontal') {

			yearContainer.classList.add('horizontal');
		}

		else if (this.visualization.options.orientation == 'verticalStretched') {

			yearContainer.classList.add('vertical-stretched');
		}

		for (const month of [...this.monthMapping.keys()].sort()) {

			if (this.visualization.collapsed == 'monthly') {

				yearContainer.appendChild(this.monthMapping.get(month).collapsedContainer);
			}

			else {

				yearContainer.appendChild(this.monthMapping.get(month).container);
			}
		}

		this.containerElement = yearContainer;

		return this.containerElement;
	}

	get containerCollapsed() {

		if (this.containerElementCollapsed) {

			return this.containerElementCollapsed;
		}

		const container = document.createElement('div');

		container.classList.add('calendar-grid', 'calendar-container');

		let firstRow = 0;

		for (const months of this.visualization.hierarchy.values()) {

			for (const month of months.values()) {

				for (const day of month) {

					day.bottomTooltip = ++firstRow <= 7;
					container.appendChild(day.container);
				}
			}
		}

		this.containerElementCollapsed = container;

		return this.containerElementCollapsed;
	}
}

class SpatialMapThemes extends Map {

	constructor(visualization) {

		super();

		this.visualization = visualization;

		for (const theme of MetaData.spatialMapThemes.keys()) {

			this.set(theme, new SpatialMapTheme({name: theme, config: MetaData.spatialMapThemes.get(theme)}, this))
		}

		this.selected = this.visualization && this.visualization.options && this.visualization.options.theme ? this.visualization.options.theme : 'Standard';
	}

	get container() {

		if (this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');

		container.classList.add('theme-list');

		for (const theme of this.values()) {

			container.appendChild(theme.container);
		}

		return container;
	}
}

class SpatialMapTheme {

	constructor(theme, themes) {

		Object.assign(this, theme);

		this.themes = themes;
	}

	get container() {

		if(this.containerElement) {
			return this.conatinerElement;
		}

		const container = this.containerElement = document.createElement('span');

		container.classList.add('theme');

		container.innerHTML = `
			<div class="name">${this.name}</div>
		`;

		if(this.themes.selected == this.name) {
			container.classList.add('selected');
		}

		container.insertBefore(this.image, container.querySelector('.name'));

		container.on('click', () => {

			for(const element of container.parentNode.querySelectorAll('.theme')) {

				element.classList.remove('selected');
			}

			this.themes.selected = container.querySelector('.name').textContent;
			container.classList.add('selected');
		});

		return container;
	}

	get image() {

		const
			image = document.createElement('div');

		image.classList.add('theme-image', 'image-container');

		image.innerHTML = `
			<div class="road"></div>
			<div class="water"></div>
			<div class="park"></div>
		`;

		if(!this.config.length) {

			image.style.background = '#fff';
			image.querySelector('.road').style.background = '#ededed';
			image.querySelector('.water').style.background = '#aadaff';
			image.querySelector('.park').style.background = '#c0ecae';
		}
		else {

			image.style.background = this.config[0].stylers[0].color;

			const
				[roadColor] = this.config.filter(x => x.featureType == 'road'),
				[waterColor] = this.config.filter(x => x.featureType == 'water'),
				[parkColor] = this.config.filter(x => x.featureType == 'poi.park');

			image.querySelector('.road').style.background = roadColor.stylers[0].color;
			image.querySelector('.water').style.background = waterColor.stylers[0].color;
			image.querySelector('.park').style.background = parkColor.stylers[0].color;
		}

		return image;
	}
}

class ReportLogs extends Set {

	constructor(owner, page, logType) {

		super();

		this.owner = owner;
		this.page = page;
		this.logClass = logType.class;
		this.ownerName = logType.name;
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('query-history');

		container.innerHTML = `
			<div class="list">
				<h3>${this.ownerName.slice(0,1).toUpperCase() + this.ownerName.slice(1)} History</h3>
				<ul></ul>
				<div class="loading">
					<span><i class="fa fa-spinner fa-spin"></i></span>
				</div>
				<div class="footer hidden">
					<span class="more">
						<i class="fa fa-angle-down"></i>
						<span>Show more logs</span>
						<i class="fa fa-angle-down"></i>
					</span>
					<span class="showing"></span>
				</div>
			</div>
			<div class="info hidden">
				<div class="toolbar"></div>
				<div class="log-form block"></div>
			</div>
		`;

		container.querySelector('.list .footer').on('click', () => {

			if(container.querySelector('.list .footer .more').classList.contains('hidden')) {

				return;
			}

			this.load()
		});

		return container;
	}

	async load() {

		this.container.querySelector('.list .loading').classList.remove('hidden');

		const
			parameters = {
				owner_id: this.owner[this.ownerName + '_id'],
				owner: this.ownerName,
				offset: this.size,
			};

		this.currentResponse =  await API.call('reports/report/logs', parameters);

		for(const log of this.currentResponse) {

			this.add(new (this.logClass)(log, this));
		}

		this.render();
	}

	render() {

		const logList = this.container.querySelector('.list ul');

		if(!this.size) {

			logList.innerHTML = '<li class="NA block">No Report History Available</li>';
			this.container.querySelector('.list .loading').classList.add('hidden');
			return;
		}

		this.container.querySelector('.list .footer .more').classList.remove('hidden');
		this.container.querySelector('.info').classList.add('hidden');
		this.container.querySelector('.list').classList.remove('hidden');

		for(const log of this.values()) {

			if(logList.contains(log.container)) {
				continue;
			}

			logList.appendChild(log.container);
		}

		this.container.querySelector('.list .loading').classList.add('hidden');

		if(this.currentResponse.length < 10) {

			this.container.querySelector('.list .footer .more').classList.add('hidden');
		}

		this.container.querySelector('.list .showing').textContent = `Showing: ${this.size}`;
		this.container.querySelector('.list .footer').classList.remove('hidden');
	}

	toggle(condition) {
		this.container.classList.toggle('hidden', !condition);
	}
}

class ReportLog {

	constructor(log, logs) {

		Object.assign(this, log);

		this.logs = logs;

		try {
			this.state = JSON.parse(this.state);
		}
		catch(e) {}
	}

	get container() {

		if(this.containerElement) {

			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('li');

		container.classList.add('block');

		container.innerHTML = `
			<span class="clock"><i class="fa fa-history"></i></span>
			<span class="timing" title="${Format.dateTime(this.created_at)}">${(this.operation == 'insert'? 'Created ' : 'Updated ') + Format.ago(this.created_at)}</span>
			${this.user_name ? `<a href="/user/profile/${this.user_id}" target="_blank">${this.user_name}</a>` : '<a>Unknown User</a>'}
		`;

		container.on('click', () => this.load());

		if(container.querySelector('a')) {
			container.querySelector('a').on('click', e => e.stopPropagation());
		}

		return container;
	}
}

class Tooltip {

	static show(div, position, content) {

		if(!div.querySelector('.tooltip')) {
			div.insertAdjacentHTML('beforeend', `<div class="tooltip"></div>`)
		}

		const
			container = div.querySelector('.tooltip'),
			distanceFromMouse = 40;

		container.innerHTML = content;

		if(container.classList.contains('hidden')) {
			container.classList.remove('hidden');
		}

		let left = Math.max(position[0] + distanceFromMouse, 5),
			top = position[1] + distanceFromMouse;

		if(left + container.clientWidth > div.clientWidth) {
			left = div.clientWidth - container.clientWidth - 5;
		}

		if(top + container.clientHeight > div.clientHeight) {
			top = position[1] - container.clientHeight - distanceFromMouse;
		}

		container.setAttribute('style', `left: ${left}px; top: ${top}px;`);
	}

	static hide(div) {

		const container = div.querySelector('.tooltip');

		if(!container) {
			return;
		}

		container.classList.add('hidden');
	}
}

class VisualizationsCanvas {

	constructor(visualizations, page) {

		this.page = page;
		this.visualizations = visualizations;
		this.loadedVisualizations = new Map();

		VisualizationsCanvas.grid = {
			columns: 32,
			rows: 10,
			rowHeight: 50,
		};

		VisualizationsCanvas.screenHeightOffset = 1.5 * screen.availHeight;
		this.editing = false;
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');

		container.classList.add('visualization-canvas');

		container.innerHTML = `
			<div class="menu hidden">
				<button type="button" class="edit"><i class="far fa-edit"></i> Edit</button>
				<button type="button" class="reorder"><i class="fas fa-random"></i> Reorder</button>
			</div>
			<div class="list"></div>
		`;

		this.list = container.querySelector('.list');

		if (this.page.user.privileges.has('report')) {

			container.querySelector('.menu').classList.remove('hidden');

			container.querySelector('.edit').on('click', () => this.edit());
			container.querySelector('.reorder').on('click', () => this.reorder());
		}

		return container;
	}

	lazyLoad(resize, offset = VisualizationsCanvas.screenHeightOffset) {

		const visitedVisualizations = new Set;

		for (const [visualization_id, visualization] of this.visualizationTrack) {

			for (const filter of visualization.query.filters.values()) {

				let datasetFilter = this.page.list && this.page.list.get(this.page.currentDashboard) && this.page.list.get(this.page.currentDashboard).globalFilters ? this.page.list.get(this.page.currentDashboard).globalFilters.get(filter.placeholder) :  null;

				if (!datasetFilter) {
					continue;
				}

				filter.value = datasetFilter.value;
			}

			if ((parseInt(visualization.position) < this.maxScrollHeightAchieved + offset) && !visualization.loaded) {

				visualization.query.visualizations.selected.load();
				visualization.loaded = true;

				this.loadedVisualizations.set(visualization_id, visualization);

				visitedVisualizations.add(visualization_id);
			}

			if (visualization.loaded) {

				visitedVisualizations.add(visualization_id);
			}
		}
		for (const visualizationId of visitedVisualizations.values()) {

			this.visualizationTrack.delete(visualizationId);
		}
	}

	render(resize) {

		this.list.textContent = null;

		this.visualizationTrack = new Map();
		this.visualizations = this.sort(this.visualizations);

		for (const row of this.visualizations) {

			row.report.container.appendChild(row.report.visualizations.selected.container);

			row.report.container.setAttribute('style', `
				order: ${row.format.position || 0};
				grid-column: auto / span ${row.format.width || VisualizationsCanvas.grid.columns};
				grid-row: auto / span ${row.format.height || VisualizationsCanvas.grid.rows};
			`);

			this.list.appendChild(row.report.container);
			row.report.container.querySelector('.visualization').classList.toggle('blur', this.editing);

			this.visualizationTrack.set(row.report.visualizations.savedOnDashboard.visualization_id, ({
				position: row.report.container.getBoundingClientRect().y,
				query: row.report,
				loaded: false,
			}));
		}

		const main = document.querySelector('main');

		this.maxScrollHeightAchieved = Math.max(VisualizationsCanvas.screenHeightOffset, main.scrollTop);

		this.lazyLoad(this.maxScrollHeightAchieved, resize);

		document.addEventListener(
			'scroll',
			() => {
				for (const row of this.visualizations) {

					if (this.visualizationTrack.get(row.report.visualizations.savedOnDashboard.visualization_id)) {

						this.visualizationTrack.get(row.report.visualizations.savedOnDashboard.visualization_id).position = row.report.container.getBoundingClientRect().y;
					}
				}

				this.maxScrollHeightAchieved = Math.max(main.scrollTop, this.maxScrollHeightAchieved);
				this.lazyLoad(resize,);
			}, {
				passive: true
			}
		);

		if (!this.loadedVisualizations.size) {

			this.container.innerHTML = '<div class="NA no-reports">No reports found!</div>';
		}
	}

	setEditMode(report) {

		const
			menu = report.container.querySelector('.menu'),
			warning = report.container.querySelector('.warning');

		if(menu) {

			menu.classList.add('hidden');

			const toggleElements = [
				menu.querySelector('.filters-toggle'),
				menu.querySelector('.query-toggle'),
				menu.querySelector('.description-toggle'),
				menu.querySelector('.pipeline-toggle')
			];

			for(const toggle of toggleElements) {

				if(toggle.parentElement.classList.contains('selected')) {

					toggle.click();
				}
			}
		}

		if(warning) {

			warning.classList.toggle('blur', this.editing);
		}

		report.container.querySelector('header h2').classList.toggle('edit');
		report.container.querySelector('.menu-toggle').classList.toggle('hidden');
		report.container.querySelector('.visualization').classList.toggle('blur', this.editing);
		report.container.querySelector('.columns').classList.toggle('blur', this.editing);
	}

	edit() {

		this.editing = !this.editing;

		const edit = this.container.querySelector('.edit');

		edit.innerHTML = this.editing ? '<i class="fas fa-check"></i> Done' : '<i class="fas fa-edit"></i> Edit';

		this.container.classList.toggle('editing', this.editing);

		for (let {query: report} of this.loadedVisualizations.values()) {

			[report.selectedVisualizationProperties] = this.visualizations.filter(x => x.visualization_id == report.visualizations.savedOnDashboard.visualization_id);

			this.setEditMode(report);

			const
				elements = [
					report.container.querySelector('header .actions .move-up'),
					report.container.querySelector('header .actions .move-down'),
					report.container.querySelector('header .actions .remove'),
					report.resize_dimentions,
					report.container.querySelector('.resize'),
				];

			for(const element of elements) {

				if(!element) {

					continue;
				}

				element.classList.toggle('hidden', !this.editing)
			}

			if(report.resize_dimentions) {

				report.resize_dimentions.position.value = report.selectedVisualizationProperties.format.position;
				report.resize_dimentions.height.value = report.selectedVisualizationProperties.format.height;
				report.resize_dimentions.width.value = report.selectedVisualizationProperties.format.width;

				continue;
			}

			const
				header = report.container.querySelector('header .actions'),
				format = report.selectedVisualizationProperties.format;

			if (!format.width)
				format.width = VisualizationsCanvas.grid.columns;

			if (!format.height)
				format.height = VisualizationsCanvas.grid.rows;

			header.insertAdjacentHTML('beforeend', `
				<a class="show move-up" title="Move visualization up"><i class="fas fa-angle-double-up"></i></a>
				<a class="show move-down" title="Move visualization down"><i class="fas fa-angle-double-down"></i></a>
				<a class="show remove" title="Remove Graph"><i class="fa fa-times"></i></a>
			`);

			report.container.insertAdjacentHTML('beforeend', `
				<form class="resize-dimentions overlay">
					<span>Position:</span>
					<span>Height:</span>
					<span>Width:</span>
					<input type="number" name="position" value="${report.selectedVisualizationProperties.format.position}">
					<input type="number" name="height" max="10" value="${report.selectedVisualizationProperties.format.height}">
					<input type="number" name="width" min="2" max="32" value="${report.selectedVisualizationProperties.format.width}">
					<button type="submit" class="hidden"></button>
				</form>
				<div class="resize" draggable="true" title="Resize Graph"></div>
			`);

			const resize = report.container.querySelector('.resize');

			report.resize_dimentions = report.container.querySelector('.resize-dimentions');

			header.querySelector('.move-up').on('click', async () => {

				const current = report.selectedVisualizationProperties;

				let previous = null;

				for (let [index, value] of this.visualizations.entries()) {

					if (value.visualization_id === current.visualization_id) {

						previous = [...this.visualizations][index - 1];
						break;
					}
				}

				if (!previous)
					return;

				current.format.position = Math.max(1, current.format.position - 1);
				previous.format.position = Math.min(this.visualizations.length, previous.format.position + 1);

				current.report.resize_dimentions.position.value = current.format.position;
				previous.report.resize_dimentions.position.value = previous.format.position;

				const
					currentParameters = {
						id: current.id,
						format: JSON.stringify(current.format),
						owner: 'visualization',
						owner_id: this.visualizations[0].owner_id
					},
					previousParameters = {
						id: previous.id,
						format: JSON.stringify(previous.format),
						owner: 'visualization',
						owner_id: this.visualizations[0].owner_id
					},
					options = {
						method: 'POST',
					};

				await Promise.all([
					API.call('reports/dashboard/update', currentParameters, options),
					API.call('reports/dashboard/update', previousParameters, options)
				]);

				this.render();
			});

			header.querySelector('.move-down').on('click', async () => {

				const current = report.selectedVisualizationProperties;
				let next = null;

				for (let [index, value] of this.visualizations.entries()) {

					if (value.visualization_id === current.visualization_id) {
						next = [...this.visualizations][index + 1];
						break;
					}
				}

				if (!next) {
					return;
				}

				current.format.position = Math.min(this.visualizations.length, current.format.position + 1);
				next.format.position = Math.max(1, next.format.position - 1);

				current.report.resize_dimentions.position.value = current.format.position;
				next.report.resize_dimentions.position.value = next.format.position;

				const
					currentParameters = {
						id: current.id,
						format: JSON.stringify(current.format),
						owner: 'visualization',
						owner_id: this.visualizations[0].owner_id
					},
					nextParameters = {
						id: next.id,
						format: JSON.stringify(next.format),
						owner: 'visualization',
						owner_id: this.visualizations[0].owner_id
					},
					options = {
						method: 'POST',
					}
				;

				await Promise.all([
					API.call('reports/dashboard/update', currentParameters, options),
					API.call('reports/dashboard/update', nextParameters, options)
				]);

				this.render();
			});

			header.querySelector('.remove').on('click', async () => {

				const
					parameters = {
						id: report.selectedVisualizationProperties.id,
					},
					options = {
						method: 'POST',
					};

				await API.call('reports/dashboard/delete', parameters, options);

				report.container.remove();

				this.visualizations = this.visualizations.filter(x => x.visualization_id != report.selectedVisualizationProperties.visualization_id);
				this.loadedVisualizations.delete(report.selectedVisualizationProperties.visualization_id);

				this.render();
			});

			report.resize_dimentions.on('submit', async e => {

				e.preventDefault();

				await this.save(report);
			});

			resize.on('dragstart', e => {
				e.stopPropagation();
				this.loadedVisualizations.beingResized = report
			});

			resize.on('dragend', e => {
				e.stopPropagation();
				this.loadedVisualizations.beingResized = null;
			});
		}

		this.container.parentElement.on('dragover', e => {

			e.preventDefault();
			e.stopPropagation();

			const report = this.loadedVisualizations.beingResized;

			if (!report) {
				return;
			}

			const
				visualizationFormat = report.selectedVisualizationProperties.format,
				columnStart = this.getColumn(report.container.offsetLeft),
				newColumn = this.getColumn(e.pageX - this.list.getBoundingClientRect().left) + 1,
				rowStart = this.getRow(report.container.offsetTop),
				newRow = this.getRow(e.pageY - this.list.getBoundingClientRect().top) + 1;

			if (newRow > rowStart) {
				visualizationFormat.height = newRow - rowStart;
			}

			if (newColumn > columnStart && newColumn <= VisualizationsCanvas.grid.columns) {
				visualizationFormat.width = newColumn - columnStart;
			}

			if (
				visualizationFormat.width != report.container.style.gridColumnEnd.split(' ')[1] ||
				visualizationFormat.height != report.container.style.gridRowEnd.split(' ')[1]
			) {

				const dimentions = report.container.querySelector('.resize-dimentions');

				dimentions.position.value = visualizationFormat.position;
				dimentions.height.value = visualizationFormat.height;
				dimentions.width.value = visualizationFormat.width;

				report.container.setAttribute('style', `
					order: ${report.selectedVisualizationProperties.format.position || 0};
					grid-column: auto / span ${dimentions.width.value || Dashboard.grid.columns};
					grid-row: auto / span ${dimentions.height.value || Dashboard.grid.rows};
				`);

				if (this.dragTimeout) {
					clearTimeout(this.dragTimeout);
				}

				this.dragTimeout = setTimeout(() => report.visualizations.selected.render({resize: true}), 100);

				if (this.saveTimeout) {
					clearTimeout(this.saveTimeout);
				}

				this.saveTimeout = setTimeout(() => this.save(report), 1000);
			}
		});
	}

	getColumn(position) {

		return Math.max(Math.floor(
			(position - this.list.offsetLeft) /
			((this.list.clientWidth / VisualizationsCanvas.grid.columns))
		), 0);
	}

	getRow(position) {

		return Math.max(Math.floor(
			(position - this.list.offsetTop) / VisualizationsCanvas.grid.rowHeight), 0
		);
	}

	async save(report) {

		const
			parameters = {
				id: report.selectedVisualizationProperties.id,
				format: JSON.stringify({
					position: report.resize_dimentions.position.value,
					height: report.resize_dimentions.height.value,
					width: report.resize_dimentions.width.value,
				}),
				owner: 'visualization',
				owner_id: this.visualizations[0].owner_id,
			},
			options = {
				method: 'POST',
			};

		await API.call('reports/dashboard/update', parameters, options);

		report.selectedVisualizationProperties.format.position = report.resize_dimentions.position.value;
		report.selectedVisualizationProperties.format.height = report.resize_dimentions.height.value;
		report.selectedVisualizationProperties.format.width = report.resize_dimentions.width.value;

		this.render();
	}

	sort(visualizations) {

		return visualizations.sort((v1, v2) => v1.format.position - v2.format.position);
	}

	async reorder() {

		const promises = [];

		for(const [index, visualization] of this.visualizations.entries()) {

			try {

				visualization.format = typeof visualization.format == 'string' ? JSON.parse(visualization.format) : visualization.format || {};
			}
			catch(e) {

				visualization.format = {
					position: index + 1,
					height: 10,
					width: 32
				};
			}

			visualization.format.position = index + 1;
			visualization.format.width = visualization.format.width || 32;
			visualization.format.height = visualization.format.height || 10;

			const parameters = {
				id: visualization.id,
				format: JSON.stringify(visualization.format),
				owner: 'visualization',
				owner_id: this.visualizations[0].owner_id
			};

			promises.push(API.call('reports/dashboard/update', parameters, {method:'POST'}));

			if(visualization.report && visualization.report.resize_dimentions) {

				visualization.report.resize_dimentions.position.value = visualization.format.position;
				visualization.report.resize_dimentions.width.value = visualization.format.width;
				visualization.report.resize_dimentions.height.value = visualization.format.height;
			}

		}

		await Promise.all(promises);

		this.render();
	}
}

class Canvas extends VisualizationsCanvas {

	async load() {

		await this.fetchDataSource();
		this.render();
	}

	async fetchDataSource() {

		for(const [index, visualization] of this.visualizations.entries()) {

			try {

				visualization.format = typeof visualization.format == 'string' ? JSON.parse(visualization.format) : visualization.format || {};
			}
			catch(e) {

				visualization.format = {};
			}

			if (!DataSource.list.has(visualization.query_id)) {

				this.visualizations.splice(index, 1);
				continue;
			}

			const dataSource = new DataSource(DataSource.list.get(visualization.query_id), this.page);

			[dataSource.visualizations.savedOnDashboard] = dataSource.visualizations.filter(v => v.visualization_id === visualization.visualization_id);

			if (!dataSource.visualizations.savedOnDashboard) {

				continue;
			}

			dataSource.visualizations.selected = dataSource.visualizations.savedOnDashboard;

			visualization.report = dataSource;

			const filters = [];

			for (const filter of visualization.report.filters.values()) {

				if (filter.multiSelect) {
					filters.push(filter.fetch());
				}
			}

			await Promise.all(filters);
			dataSource.container.appendChild(dataSource.visualizations.savedOnDashboard.container);
		}
	}
}

class DataSourceFilterForm {

	constructor(filter, page) {

		this.filter = filter;
		this.page = page;
		this.datasetMultiSelect = new MultiSelect({dropDownPosition: 'top', multiple: false});
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('form');

		container.classList.add('form', 'filter-form');

		container.innerHTML = `

			<label>
				<span>Name <span class="red">*</span></span>
				<input type="text" name="name" value="${this.filter.name || ''}" required>
			</label>

			<label>
				<span>Placeholder <span class="red">*</span><span class="right" data-tooltip="Uniquely identifies the filter in this report.">?</span></span>
				<input type="text" name="placeholder" value="${this.filter.placeholder || ''}" required>
			</label>

			<label>
				<span>Type <span class="red">*</span></span>
				<select name="type" required></select>
			</label>

			<label>
				<span>Description</span>
				<input type="text" name="description" value="${this.filter.description || ''}">
			</label>

			<label>
				<span>Order</span>
				<input type="number" name="order" value="${this.filter.order || ''}">
			</label>

			<label class="dataset">
				<span>Dataset <span class="right" data-tooltip="A set of possible values for this filter.">?</span></span>
			</label>

			<label class="multiple">
				<span>Allow Multiple <span class="right" data-tooltip="Can the user pick multiple values.">?</span></span>
				<select name="multiple">
					<option value="0">No</option>
					<option value="1">Yes</option>
				</select>
			</label>

			<div class="label">

				<span>Default Value <span class="right" data-tooltip="Calculated and applied on first load\nif a global filter with same placeholder isn't added.">?</span></span>

				<select name="default_type">
					<option value="none">None</option>
					<option value="default_value">Fixed</option>
					<option value="offset">Relative</option>
				</select>

				<input type="text" name="default_value" value="${this.filter.default_value || ''}">

				<div class="offsets">
					<div class="footer">
						<span class="result">
							<span class="key">Final:</span>
							<span class="value"></span>
						</span>
						<button type="button" class="add-offset"><i class="fa fa-plus"></i> Add Offset</button>
					</div>
				</div>
			</div>
		`;

		for(const type of MetaData.filterTypes.values()) {

			if(!type.input_type) {
				continue;
			}

			container.type.insertAdjacentHTML('beforeend', `
				<option value="${type.name.toLowerCase()}">${type.name}</option>
			`);
		}

		container.type.value = this.filter.type || 'text';
		container.multiple.value = this.filter.multiple || '0';

		// Filter dataset multiselect setup
		{
			const datalist = [];

			for(const source of DataSource.list.values()) {

				if(source.query_id == this.filter.query_id) {
					continue;
				}

				datalist.push({
					name: source.name,
					value: source.query_id,
					subtitle: '#' + source.query_id,
				});
			}

			this.datasetMultiSelect.datalist = datalist;
			this.datasetMultiSelect.render();

			container.querySelector('label.dataset').appendChild(this.datasetMultiSelect.container);

			this.datasetMultiSelect.value = this.filter.dataset;
			this.datasetMultiSelect.on('change', () => this.updateFormFields());
		}

		{
			const default_value = container.default_value.value;

			if(container.default_value.value) {
				container.default_type.value = 'default_value';
			}

			else if(this.filter.offset && this.filter.offset.length) {
				container.default_type.value = 'offset';
			}

			else {
				container.default_type.value = 'none';
			}

			container.type.on('change', () => this.changeFilterType());

			container.default_type.on('change', () => this.updateFormFields());

			this.changeFilterType();
			this.updateFormFields();
		}

		// Set up offset rows & behavior
		{
			const
				offsets = container.querySelector('.offsets'),
				footer = container.querySelector('.footer'),
				addOffset = container.querySelector('.footer .add-offset');

			for(const offset of this.filter.offset || []) {
				offsets.insertBefore(this.offset(offset), footer);
			}

			addOffset.on('click', () => {
				offsets.insertBefore(this.offset(), footer);
				this.offsetChange();
			});
		}

		container.on('submit', e => {
			e.preventDefault();
		});

		return container;
	}

	get json() {

		const response = {
			filter_id: this.filter.filter_id,
			dataset: this.datasetMultiSelect.value[0] || '',
		};

		for(const [name, value] of new FormData(this.container)) {
			response[name] = value;
		}

		response.multiple = parseInt(response.multiple) || 0;

		response.default_value = '';
		response.offset = [];

		if(this.container.default_type.value == 'offset') {

			for(const offset of this.container.querySelectorAll('.offset')) {

				const
					value = offset.querySelector('input[name=value]').value,
					unit = offset.querySelector('select[name=unit]').value,
					direction = offset.querySelector('select[name=direction]').value,
					snap = offset.querySelector('input[name=snap]').checked;

				response.offset.push({
					value: isNaN(parseInt(value)) ? null : parseInt(value),
					unit,
					direction: parseInt(direction),
					snap,
				});
			}
		}

		else if(this.container.default_type.value == 'default_value') {
			response.default_value = this.container.default_value.value;
		}

		if(response.order != '')
			response.order = parseFloat(response.order);

		if(response.dataset != '')
			response.dataset = parseFloat(response.dataset);

		return response;
	}

	changeFilterType() {

		const types = ['hidden', 'column', 'literal'];

		if(this.container.type.value == 'datetime') {
			this.container.default_value.type = 'datetime-local';
		}

		else if(this.container.type.value == 'year') {
			this.container.default_value.type = 'number';
		}

		else if(this.container.type.value == 'time') {

			this.container.default_value.type = 'time';
			this.container.default_value.step = '1';
		}

		else if(types.includes(this.container.type.value)) {
			this.container.default_value.type = 'text';
		}

		else {
			this.container.default_value.type = this.container.type.value;
		}
	}

	updateFormFields() {

		this.container.default_value.classList.toggle('hidden', this.container.default_type.value != 'default_value');
		this.container.querySelector('.offsets').classList.toggle('hidden', this.container.default_type.value != 'offset');

		this.container.querySelector('.multiple').classList.toggle('hidden', !this.datasetMultiSelect.value.length);

		this.offsetChange();
	}

	offsetChange() {

		clearInterval(this.offsetChangeTimeout);

		let f;

		this.offsetChangeTimeout = setInterval((f = () => {

			const
				offset = this.json.offset || [],
				containers = this.container.querySelectorAll('.offsets .offset .result .value'),
				copy = [];

			for(const [index, entry] of offset.entries()) {

				copy.push(entry);
				copy.filterType = this.container.type.value;
				containers[index].innerHTML = DataSourceFilter.parseOffset(copy) || '&mdash;';
			}

			offset.filterType = this.container.type.value;
			this.container.querySelector('.offsets > .footer .result .value').innerHTML = DataSourceFilter.parseOffset(offset) || '&mdash;';

			return f;
		})(), 500);
	}

	offset(offset = {}) {

		const container = document.createElement('div');

		container.classList.add('offset');

		container.innerHTML = `

			<input type="number" step="1" name="value" value="${isNaN(parseFloat(offset.value)) ? '' : offset.value}" required>

			<select name="unit">
				<option value="second">Second</option>
				<option value="minute">Minute</option>
				<option value="hour">Hour</option>
				<option value="day">Day</option>
				<option value="week">Week</option>
				<option value="month">Month</option>
				<option value="year">Year</option>
			</select>

			<select name="direction">
				<option value="-1">Ago</option>
				<option value="1">From Now</option>
			</select>

			<label class="snap" title="Snap to the nearest time unit"><input type="checkbox" name="snap"> Snap</label>

			<span class="delete" title="Remove Offset"><i class="far fa-trash-alt"></i></span>

			<div class="result">
				<span class="key">Result:</span>
				<span class="value"></span>
			</div>
		`;

		const
			value = container.querySelector('input[name=value]'),
			unit = container.querySelector('select[name=unit]'),
			direction = container.querySelector('select[name=direction]'),
			snap = container.querySelector('input[name=snap]');

		value.value = isNaN(parseInt(offset.value)) ? '' : offset.value;
		unit.value = offset.unit || 'second';
		direction.value = offset.direction || '-1' ;
		snap.checked = offset.snap;

		value.on('change', () => this.offsetChange());
		unit.on('change', () => this.offsetChange());
		direction.on('change', () => this.offsetChange());
		snap.on('change', () => this.offsetChange());

		container.querySelector('.delete').on('click', () => {
			container.remove();
			this.offsetChange();
		});

		this.offsetChange();

		return container;
	}
}

DataSourceFilter.setup();
DataSourceColumnFilter.setup();
DataSourceColumnAccumulation.setup();