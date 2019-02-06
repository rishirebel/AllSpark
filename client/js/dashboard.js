Page.class = class Dashboards extends Page {

	constructor() {

		super();

		Dashboard.setup(this);

		this.list = new Map;
		this.loadedVisualizations = new Set;
		this.nav = document.querySelector('main > nav');

		this.listContainer = this.container.querySelector('section#list');
		this.reports = this.container.querySelector('section#reports');
		this.listContainer.form = this.listContainer.querySelector('.form.toolbar');

		const menuToggle = document.createElement('span');
		menuToggle.classList.add('menu-toggle');
		menuToggle.innerHTML = `<i class="fa fa-bars"></i>`;
		document.querySelector('header').insertAdjacentElement('afterbegin', menuToggle);

		const navBlanket = this.container.querySelector('.nav-blanket');

		menuToggle.on('click', () => {
			this.nav.classList.toggle('show');
			navBlanket.classList.toggle('hidden');
			menuToggle.classList.toggle('selected');
			this.container.querySelector('.nav-blanket').classList.toggle('hidden', !this.nav.classList.contains('show'));
		});

		navBlanket.on('click', () => {

			this.nav.classList.remove('show');
			navBlanket.classList.add('hidden');
			menuToggle.classList.remove('selected');
			this.container.querySelector('.nav-blanket').classList.toggle('hidden', !this.nav.classList.contains('show'));
		});

		this.nav.querySelector('.collapse-panel').on('click', async () => {

			document.querySelector('body').classList.toggle('floating');

			await Storage.set('menu-collapsed', document.querySelector('body').classList.contains('floating'));
			this.nav.classList.remove('show');
			this.container.querySelector('.nav-blanket').classList.toggle('hidden', !this.nav.classList.contains('show'));
		});

		if(this.urlSearchParameters.get('download')) {
			Storage.set('menu-collapsed', 1);
		}

		this.reports.querySelector('.toolbar #back').on('click', async () => {

			this.sortTable = new SortTable({
				table: this.container.querySelector('#list table.block'),
			});

			this.renderList();

			await Sections.show('list');
			history.pushState(null, '', window.location.pathname.slice(0, window.location.pathname.lastIndexOf('/')));
		});

		const watermarkDiv = document.createElement('div');
		watermarkDiv.classList.add('hidden', 'pdf-watermark');

		watermarkDiv.textContent = `Downloaded from ${window.location.hostname}`

		this.container.appendChild(watermarkDiv);

		window.on('popstate', e => this.load(e.state));

		this.navbar = new Navbar(new Map, this);

		this.load();
	}

	get currentDashboard() {

		return parseInt(window.location.pathname.split('/').includes('dashboard') ? window.location.pathname.split('/').pop() : 0);
	}

	get searchBar() {

		if(this.searchBarFilter) {
			return this.searchBarFilter;
		}

		const
			filters = [
				{
					key: 'Visualization ID',
					rowValue: row => [row.visualization_id],
				},
				{
					key: 'Name',
					rowValue: row => row.name ? [row.name] : [],
				},
				{
					key: 'Type',
					rowValue: row => [row.type],
				},
				{
					key: 'Tags',
					rowValue: row => row.tags ? row.tags.split(',').map(t => t.trim()) : [],
				},
				{
					key: 'Created By',
					rowValue: row => row.added_by_name ? [row.added_by_name] : [],
				},
				{
					key: 'Category',
					rowValue: row => MetaData.categories.has(row.source.subtitle) ? [MetaData.categories.get(row.source.subtitle).name] : [],
				}
			]
		;

		this.searchBarFilter = new SearchColumnFilters({
			data: [],
			filters: filters,
			advancedSearch: true,
		});

		this.container.querySelector('.section#list').insertBefore(this.searchBarFilter.container, this.container.querySelector('.section#list .block'));

		this.container.querySelector('.section#list .toolbar').appendChild(this.searchBarFilter.globalSearch.container);

		this.searchBarFilter.on('change', () => this.renderList());

		this.sortTable = new SortTable({
			table: this.container.querySelector('#list table.block'),
		});

		this.renderList();

		return this.searchBarFilter;
	}

	parents(id) {

		let dashboard = this.list.get(id);

		const parents = [id];

		if (!dashboard) {
			return [];
		}

		if (!dashboard.parent) {
			return parents
		}

		while (dashboard && dashboard.parent && this.list.has(dashboard.parent)) {
			parents.push(dashboard.parent);
			dashboard = this.list.get(dashboard.parent);
		}

		return parents;
	}

	render({dashboardId = 0, renderNav = false, updateNav = true, reloadDashboard = true, searchParam = ''} = {}) {

		if (dashboardId && reloadDashboard) {

			this.nav.classList.remove('show');
			this.container.querySelector('.nav-blanket').classList.add('hidden');

			(async () => {

				this.loadedVisualizations.clear();

				if(!this.list.has(dashboardId)) {
					this.container.querySelector('section#reports h1').innerHTML = 'Dashboard not found!';
					Sections.show('reports');
					return;
				}

				history.pushState({
					filter: dashboardId,
					type: 'dashboard'
				}, '', `/dashboard/${dashboardId}${searchParam}`);

				await this.list.get(dashboardId).load();
				await this.list.get(dashboardId).render();
			})()
		}

		if (renderNav) {
			this.renderList();
			this.navbar.render();
		}

		if (updateNav) {

			let parentDashboards = this.parents(dashboardId || 0).map(x => `dashboard-${x}`);

			for (const label of this.nav.querySelectorAll('.label')) {

				const submenu = label.parentElement.querySelector('.submenu');

				if (submenu) {
					submenu.classList.add('hidden');
				}

				label.classList.remove('selected');
				label.parentElement.classList.remove('list-open');
			}

			for (const element of parentDashboards) {

				const label = this.nav.querySelector(`#${element}`);

				if (!label) {
					continue;
				}

				const submenu = label.parentElement.querySelector('.submenu');

				submenu && submenu.classList.remove('hidden');
				label && label.classList.add('selected');
				submenu && label.parentElement.classList.add('list-open');
			}
		}
	}

	tagSearch(e, tag) {

		e.stopPropagation();

		for(const filter of this.searchBarFilter.values()) {

			const values = filter.json;

			if(values.functionName == 'equalto' && values.query == tag.trim() && values.searchValue == 'Tags') {
				return;
			}
		}

		const tagFilter = new SearchColumnFilter(this.searchBarFilter);

		this.searchBarFilter.add(tagFilter);

		this.searchBarFilter.render();

		tagFilter.json = {
			searchQuery: tag.trim(),
			searchValue: 'Tags',
			searchType: 'equalto',
		};

		this.searchBarFilter.globalSearch.container.querySelector('.advanced').click();
		this.searchBarFilter.changeCallback();
	}

	renderList() {

		this.listContainer.querySelector('h2').textContent = this.list.has(this.currentDashboard) ? this.list.get(this.currentDashboard).name : 'Dashboard';

		this.searchBar.data = [];

		const
			thead = this.listContainer.querySelector('thead'),
			tbody = this.listContainer.querySelector('tbody');

		tbody.textContent = null;

		thead.innerHTML = `
			<tr>
				<th>Title</th>
				<th>Type</th>
				<th>Tags</th>
			</tr>
		`;

		const
			visualizations = [],
			currentDashboardFormat = this.list.get(this.currentDashboard) ? this.list.get(this.currentDashboard).format || {} : {},
			[subtitleFilter] = [...this.searchBar.values()].filter(x => x.json.columnName == 'Category'),
			defaultCategoryName = MetaData.categories.has(currentDashboardFormat.category_id) ? MetaData.categories.get(currentDashboardFormat.category_id).name : '',
			currentSubtitleValue = subtitleFilter ? subtitleFilter.json.query : defaultCategoryName
		;

		for (const report of [...DataSource.list.values()]) {

			const categoryName = MetaData.categories.has(report.subtitle) ? MetaData.categories.get(report.subtitle).name : '';

			if(currentSubtitleValue && categoryName != currentSubtitleValue) {

				continue;
			}

			const datasource = new DataSource(report, page);

			if (!(datasource.visualizations && datasource.visualizations.length)) {

				continue;
			}

			visualizations.push(...datasource.visualizations.filter(x => x.visualization_id));
		}

		this.searchBar.data = visualizations;

		for(const visualization of this.searchBar.filterData) {

			const tr = document.createElement('tr');

			let
				description = visualization.description ? visualization.description.split(' ').slice(0, 20) : [],
				tags = visualization.tags ? visualization.tags.split(',') : [];

			if (description.length === 20) {

				description.push('&hellip;');
			}

			tags = tags.map(tag => {

				const a = document.createElement('a');
				a.classList.add('tag');
				a.textContent = tag.trim();

				a.on('click', e => this.tagSearch(e, tag));

				return a;
			});

			tr.innerHTML = `
				<td>
					<a href="/visualization/${visualization.visualization_id}" target="_blank" class="link">
						${visualization.name} <span class="NA">${visualization.visualization_id ? '#' + visualization.visualization_id : ''}</span>
					</a>
				</td>
				<td>${visualization.type}</td>
				<td class="tags"></td>
			`;

			for (const tag of tags) {

				tr.querySelector('.tags').appendChild(tag);
			}

			tr.querySelector('.link').on('click', e => e.stopPropagation());

			tr.on('click', async () => {

				this.report(visualization.visualization_id, true);
				history.pushState({filter: visualization.visualization_id}, '', `/visualization/${visualization.visualization_id}`);
			});

			tbody.appendChild(tr);
		}

		if (!tbody.children.length)
			tbody.innerHTML = `<tr class="NA no-reports"><td colspan="6">No Visualizations Found!</td></tr>`;

		this.sortTable.sort();
	}

	/**
	 * 0 parent means root, ie any dashboard with 0 parent means that dashboard is root dashboard.
	 flattens dashboard hierarchy and checks if there is single node cycle found.
	 */
	cycle() {

		const simplifiedTreeMapping = new Map;

		for (const node of this.list.keys()) {

			if (!simplifiedTreeMapping.has(node)) {
				simplifiedTreeMapping.set(node, new Set);
			}

			simplifiedTreeMapping.get(node).add(this.list.get(node).parent || 0);
		}

		for (const [dashboardId, parents] of simplifiedTreeMapping.entries()) {

			let moved = true;

			let toDelete = [], toReplace = [];

			while (moved) {

				for (const parent of parents) {

					if(simplifiedTreeMapping.has(parent) && simplifiedTreeMapping.get(parent).has(parent)) {

						this.list.delete(parent);
						moved = false;
						break;
					}

					if (parents.has(0) || parents.has(dashboardId)) {

						this.list.delete(parent);
						moved = false;
						break;
					}

					if(!simplifiedTreeMapping.has(parent)) {

						moved = false;
						break;
					}

					if(simplifiedTreeMapping.has(parent) && simplifiedTreeMapping.get(parent).has(parent)) {

						this.list.delete(parent);
						moved = false;
						break;
					}

					moved = false;

					if (simplifiedTreeMapping.has(parent)) {

						toDelete = [parent];
						moved = true;

						if (simplifiedTreeMapping.has(parent) && simplifiedTreeMapping.get(parent).has(0)) {

							toDelete = [...parents];
							toReplace = [parent];
							moved = false;

							break;
						}

						else {

							toReplace.push(...simplifiedTreeMapping.get(parent));
						}
					}
				}

				for (const element of toDelete) {
					simplifiedTreeMapping.get(dashboardId).delete(element);
				}

				for (const element of toReplace) {
					simplifiedTreeMapping.get(dashboardId).add(element);
				}
			}
		}

		for (const [k, v] of simplifiedTreeMapping) {

			if (v.has(k)) {
				this.list.delete(k);
			}
		}
	}

	async load(state) {

		const
			[_, dashboardList] = await Promise.all([
				DataSource.load(),
				API.call('dashboards/list'),
			]),
			currentId = state ? state.filter : parseInt(window.location.pathname.split('/').pop());

		this.dashboardList = dashboardList;

		for (const dashboard of dashboardList) {

			dashboard.children = new Set;
			this.list.set(dashboard.id, new Dashboard(dashboard, this));
		}

		this.cycle();
		this.renderList();

		for (const dashboard of this.list.values()) {

			if (dashboard.parent && this.list.has(dashboard.parent)) {
				this.list.get(dashboard.parent).children.add(dashboard);
			}
		}

		const emptyDashboards = [];

		for (const dashboard of this.list.values()) {

			if (dashboard.visibleVisuliaztions.size === 0) {
				emptyDashboards.push(this.parents(dashboard.id));
			}
		}

		for (const dashboard of emptyDashboards) {
			this.list.delete(dashboard);
		}

		this.navbar = new Navbar(this.list, this);

		this.navbar.render();

		if (this.account.settings.get('user_onboarding') && (await Storage.get('newUser') || (this.user.privileges.has('admin') && !DataSource.list.size))) {

			await Storage.set('newUser', (await Storage.get('newUser')) || {});

			Page.loadOnboardScripts();
		}

		if((await Storage.has('menu-collapsed')) && (await Storage.get('menu-collapsed'))) {

			document.querySelector('body').classList.toggle('floating', !document.querySelector('body').classList.contains('floating'));
		}

		if (window.location.pathname.split('/').filter(p => p).pop() === 'first') {

			this.navbar.render();

			let dashboardReference = this.container.querySelector('nav .item:not(.hidden)');

			if (!dashboardReference) {

				this.renderList();
				return await Sections.show('list')
			}

			while (dashboardReference.querySelector('.submenu')) {

				dashboardReference.querySelector('.label').click();
				dashboardReference = dashboardReference.querySelector('.submenu');
			}

			return dashboardReference.querySelector('.label').click();
		}

		this.render({dashboardId: 0});

		if (!currentId) {
			return await Sections.show('list');
		}

		if(window.location.pathname.split('/').some(x => x == 'report')) {
			return await this.report(currentId);
		}

		if(window.location.pathname.split('/').some(x => x == 'visualization')) {
			return await this.report(currentId, true);
		}

		return this.render({dashboardId: currentId, renderNav: true, updateNav: false, searchParam: location.search});
	}

	async report(id, visualization = false) {

		let report = DataSource.list.get(id);

		if(visualization) {
			for(const source of DataSource.list.values()) {
				if(source.visualizations.some(v => v.visualization_id == id)) {
					report = source;
				}
			}
		}

		if(!report) {

			this.container.querySelector('section#reports h1').innerHTML = (visualization ? 'Visualization' : 'Report') + ' not found!';
			Sections.show('reports');
			return;
		}

		report = new DataSource(report);

		const container = this.reports.querySelector(':scope > .list');

		this.loadedVisualizations.clear();
		this.loadedVisualizations.add(report);

		const dashboardName = this.container.querySelector('.dashboard-name');
		dashboardName.classList.add('hidden');

		container.textContent = null;

		const promises = [];

		for (const filter of report.filters.values()) {

			if (filter.multiSelect) {
				promises.push(filter.fetch());
			}
		}

		await Promise.all(promises);

		report.container.removeAttribute('style');
		container.classList.add('singleton');
		Dashboard.toolbar.classList.add('hidden');

		this.container.querySelector('#reports .global-filters').classList.add('hidden');

		if(visualization) {
			[report.visualizations.selected] = report.visualizations.filter(v => v.visualization_id == id);
		}

		report.menu.classList.remove('hidden');

		if (!report.container.contains(report.menu)) {
			report.container.appendChild(report.menu);
		}

		container.appendChild(report.container);

		// .then because we don't want to await on visualization load
		report.visualizations.selected.load()
			.then(() => report.postProcessors.render());

		await Sections.show('reports');
	}
};

class Dashboard {

	constructor(dashboardObject, page) {

		this.page = page;
		this.children = new Set;

		this.parents = new Set;

		if (this.parent) {

			this.parents.add(this.parent);
		}

		Object.assign(this, dashboardObject);

		Dashboard.grid = {
			columns: 32,
			rows: 10,
			rowHeight: 50,
		};

		let offset = 1.5;

		if(this.page.urlSearchParameters.get('download'))
			offset = Math.min();

		Dashboard.screenHeightOffset = offset * screen.availHeight;

		this.visibleVisuliaztions = new Set;

		this.visualizations = Dashboard.sortVisualizations(this.visualizations);

		this.resetSideButton();

		for (const visualization of this.visualizations) {

			if (!visualization.format) {
				visualization.format = {};
			}

			if (!DataSource.list.has(visualization.query_id)) {
				continue;
			}

			const dataSource = new DataSource(JSON.parse(JSON.stringify(DataSource.list.get(visualization.query_id))), this.page);

			dataSource.container.setAttribute('style', `
				order: ${visualization.format.position || 0};
				grid-column: auto / span ${visualization.format.width || Dashboard.grid.columns};
				grid-row: auto / span ${visualization.format.height || Dashboard.grid.rows};
			`);

			dataSource.selectedVisualization = dataSource.visualizations.filter(v =>
				v.visualization_id === visualization.visualization_id
			);

			if (!dataSource.selectedVisualization.length) {
				continue;
			}

			dataSource.selectedVisualization = dataSource.selectedVisualization[0];

			this.visibleVisuliaztions.add(dataSource);

			dataSource.container.appendChild(dataSource.selectedVisualization.container);
		}

		this.forkPartialDashboard = new ForkPartialDashboard({
			currentDashboard: this,
			dashboards: page.dashboardList,
			type: 'Partial Dashboard',
			name: this.name,
		});

		this.forkCompleteDashboard = new ForkCompleteDashboard({
			currentDashboard: this,
			dashboards: page.dashboardList,
			type: 'Complete Dashboard',
			name: this.name,
		});
	}

	static setup(page) {

		Dashboard.grid = {
			columns: 32,
			rows: 10,
			rowHeight: 50,
		};

		Dashboard.toolbar = page.container.querySelector('section#reports .toolbar');
		Dashboard.container = page.container.querySelector('section#reports .list');

		const
			sideButton = page.container.querySelector('#reports .side'),
			container = page.container.querySelector('#reports #blanket');

		sideButton.on('click', () => {

			container.classList.toggle('hidden');
			sideButton.classList.toggle('selected');

			const globalFilters = page.container.querySelector('#reports .global-filters');

			globalFilters.classList.toggle('show');

			if (page.account.settings.get('global_filters_position') == 'top') {
				globalFilters.classList.toggle('top');
				globalFilters.classList.toggle('right');
			}
		});

		container.on('click', () => {

			container.classList.add('hidden');
			sideButton.classList.remove('selected');

			const globalFilters = page.container.querySelector('#reports .global-filters');

			globalFilters.classList.toggle('show');

			if (page.account.settings.get('global_filters_position') == 'top') {
				globalFilters.classList.toggle('top');
				globalFilters.classList.toggle('right');
			}
		});

		const fullScreenButton = page.container.querySelector('#reports .toolbar #full-screen');

		fullScreenButton.on('click', () => {

			const dashboardList = page.container.querySelector('#reports');

			if(document.isFullScreen || document.webkitIsFullScreen || document.mozIsFullScreen) {

				if(document.exitFullscreen) {
					document.exitFullscreen();
				}

				else if(document.webkitExitFullscreen) {
					document.webkitExitFullscreen();
				}

				else if(document.mozExitFullscreen) {
					document.mozExitFullscreen();
				}
			}

			else {

				if(dashboardList.requestFullscreen) {
					dashboardList.requestFullscreen();
				}

				else if(dashboardList.webkitRequestFullscreen) {
					dashboardList.webkitRequestFullscreen();
				}

				else if(dashboardList.mozRequestFullscreen) {
					dashboardList.mozRequestFullscreen();
				}
			}
		});

		document.on('webkitfullscreenchange', () => {

			if(document.isFullScreen || document.webkitIsFullScreen || document.mozIsFullScreen) {
				fullScreenButton.innerHTML = `<i class="fas fa-compress"></i> Exit Full Screen`;
			}

			else {
				fullScreenButton.innerHTML = `<i class="fas fa-expand"></i> Full Screen`;
			}
		});

		const share = page.container.querySelector('#share');

		share.on('click', () => {

			const
				dialougeBox = new DialogBox(),
				shareURL = `${location.href}?${Dashboard.urlSearchString()}`;

			dialougeBox.heading = `Share this URL`;

			dialougeBox.body.innerHTML = `
				<div class="share-url">
					<input value="${shareURL}" readonly>
				</div>
			`;

			dialougeBox.show();

			dialougeBox.body.querySelector('.share-url input').select();
		});

		// const partiallyFork = page.container.querySelector('#partially-fork');

		// partiallyFork.on('click', () => {

		// 	const dashboard = page.list.get(page.currentDashboard);
		// 	dashboard.forkPartialDashboard.forkDialogBox.body.appendChild(dashboard.forkPartialDashboard.container);
		// });

		const completeFork = page.container.querySelector('#complete-fork');

		completeFork.on('click', () => {

			const dashboard = page.list.get(page.currentDashboard);
			dashboard.forkCompleteDashboard.forkDialogBox.body.appendChild(dashboard.forkCompleteDashboard.container);
		});

		const
			download = page.container.querySelector('.download'),
			downloadOptions = download.querySelector('.options');

		download.classList.toggle('hidden', !page.account.features.has('export_headless'));

		download.querySelector('button').on('click', (e) => {

			e.stopPropagation();

			downloadOptions.classList.toggle('hidden');
		});

		document.on('click', () => {
			downloadOptions.classList.add('hidden');
		});

		downloadOptions.querySelector('.pdf').on('click', e => {
			e.stopPropagation();
			Dashboard.download('pdf')
		});

		downloadOptions.querySelector('.png').on('click', e => {
			e.stopPropagation();
			Dashboard.download('png')
		});

		downloadOptions.querySelector('.jpeg').on('click', e => {
			e.stopPropagation();
			Dashboard.download('jpeg')
		});
	}

	static urlSearchString() {

		const parameters = new URLSearchParams();

		for(const [key, value] of Dashboard.selectedValues)
			parameters.set(key, value);

		return parameters;
	}

	static async download(type) {

		await API.refreshToken();

		const searchParam = new URLSearchParams(location.search);

		searchParam.set('download', true);
		searchParam.set('locale', navigator.language);
		searchParam.set('external_parameters', 1);
		searchParam.set('token', (await Storage.get('token')).body);
		searchParam.set('refresh_token', await Storage.get('refresh_token'));

		for(const [key, value] of Dashboard.urlSearchString()) {
			searchParam.set(key, value);
		}

		const
			urlToDownload = `${location.origin}${location.pathname}?${searchParam}`,
			options = {
				raw: true,
			},
			parameter = {
				url: urlToDownload,
				type: type,
			};

		let content;

		try {

			content = await API.call('reports/download/pdf', parameter, options);
		}
		catch(e) {

			return new SnackBar({
				message: 'Request Failed',
				subtitle: e.message || e,
				icon: 'fas fa-ban',
				type: 'error',
			});
		}

		if(content.headers.get('content-type').includes('pdf')) {

			content = await content.blob();

			const link = document.createElement('a');
			link.href = window.URL.createObjectURL(content);
			link.download = page.list.get(page.currentDashboard).name + '-' + Format.dateTime(Date.now()) + '.pdf';
			link.classList.add('hidden');
			document.querySelector('body').appendChild(link);
			link.click();
			link.remove();
		}
		else if(content.headers.get('content-type').includes('image')) {

			content = await content.blob();

			const link = document.createElement('a');
			link.href = window.URL.createObjectURL(content);
			link.download = page.list.get(page.currentDashboard).name + '-' + Format.dateTime(Date.now()) + '.' + type;
			link.classList.add('hidden');
			document.querySelector('body').appendChild(link);
			link.click();
			link.remove();
		}
		else {

			new SnackBar({
				message: 'Request Failed',
				subtitle: `Unable to download ${type}`,
				icon: 'fas fa-ban',
				type: 'error',
			});
		}
	}

	static sortVisualizations(visibleVisuliaztions) {

		return visibleVisuliaztions.sort((v1, v2) => v1.format.position - v2.format.position);
	}

	lazyLoad(resize, offset = Dashboard.screenHeightOffset) {

		const visitedVisualizations = new Set;

		for (const [visualization_id, visualization] of this.visualizationTrack) {

			if ((parseInt(visualization.position) < this.maxScrollHeightAchieved + offset) && !visualization.loaded) {

				if(!visualization.query.selectedVisualization.load)
					continue;

				visualization.query.selectedVisualization.load();

				visualization.loaded = true;
				this.page.loadedVisualizations.add(visualization);

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

	resetSideButton() {

		const sideButton = this.page.container.querySelector('#reports .side');

		sideButton.classList.remove('hidden');
		sideButton.classList.remove('show');
		sideButton.classList.remove('selected');
		this.page.container.querySelector('#reports #blanket').classList.add('hidden');
	}

	mailto() {

		const form = this.page.reports.querySelector('.mailto-content');
		form.classList.toggle('hidden');

		form.subject.value = this.name;
		form.body.value = location.href;

		form.on('submit', (e) => {

			e.preventDefault();

			const searchParams = new URLSearchParams();
			searchParams.set('subject', form.subject.value);
			searchParams.set('body', form.body.value);

			const a = document.createElement('a');
			a.setAttribute('href', `mailto: ${form.email.value}?${searchParams}`);

			a.click();
		})
	}

	edit() {

		Dashboard.editing = true;

		const edit = Dashboard.toolbar.querySelector('#edit-dashboard');

		edit.classList.add('hidden');

		Dashboard.container.classList.add('editing');

		for (const report of this.visibleVisuliaztions) {

			const [selectedVisualizationProperties] = this.page.list.get(this.id).visualizations.filter(x => x.visualization_id === report.selectedVisualization.visualization_id);

			report.selectedCanvasVisualization = selectedVisualizationProperties

			if (!report.format) {
				report.format = {};
			}

			report.format.format = selectedVisualizationProperties.format;

			const
				header = report.container.querySelector('header .actions'),
				format = report.selectedCanvasVisualization.format;

			if (!format.width) {
				format.width = Dashboard.grid.columns;
			}

			if (!format.height) {
				format.height = Dashboard.grid.rows;
			}

			header.insertAdjacentHTML('beforeend', `
				<a class="show move-up" title="Move visualization up"><i class="fas fa-angle-double-up"></i></a>
				<a class="show move-down" title="Move visualization down"><i class="fas fa-angle-double-down"></i></a>
				<a class="show remove" title="Remove Graph"><i class="fa fa-times"></i></a>
			`);

			header.querySelector('.move-up').on('click', () => {

				const current = report.selectedCanvasVisualization;

				let previous = null;

				for (let [index, value] of this.visualizations.entries()) {

					if (value.visualization_id === current.visualization_id) {
						previous = [...this.visualizations][index - 1];
						break;
					}
				}

				if (!previous) {
					return;
				}

				current.format.position = Math.max(1, current.format.position - 1);
				previous.format.position = Math.min(this.visualizations.length, previous.format.position + 1);

				const
					currentParameters = {
						id: current.id,
						format: JSON.stringify(current.format),
						owner: 'dashboard',
						owner_id: this.id
					},
					currentOptions = {
						method: 'POST',
					};

				API.call('reports/dashboard/update', currentParameters, currentOptions);

				const
					previousParameters = {
						id: previous.id,
						format: JSON.stringify(previous.format),
						owner: 'dashboard',
						owner_id: this.id
					},
					previousOptions = {
						method: 'POST',
					};

				API.call('reports/dashboard/update', previousParameters, previousOptions);

				this.page.load();
			});

			header.querySelector('.move-down').on('click', () => {

				const current = report.selectedCanvasVisualization;

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

				const
					currentParameters = {
						id: current.id,
						format: JSON.stringify(current.format),
						owner: 'dashboard',
						owner_id: this.id
					},
					currentOptions = {
						method: 'POST',
					};

				API.call('reports/dashboard/update', currentParameters, currentOptions);

				const
					nextParameters = {
						id: next.id,
						format: JSON.stringify(next.format),
						owner: 'dashboard',
						owner_id: this.id
					},
					nextOptions = {
						method: 'POST',
					};

				API.call('reports/dashboard/update', nextParameters, nextOptions);

				this.page.load();
			});

			header.querySelector('.remove').on('click', async () => {

				if(!confirm('Are you sure?')) {
					return;
				}

				const
					parameters = {
						id: this.visualizations.filter(r => r.visualization_id == report.visualizations.selected.visualization_id)[0].id,
					},
					options = {
						method: 'POST',
					};

				await API.call('reports/dashboard/delete', parameters, options);

				await this.page.load();
			});

			report.container.insertAdjacentHTML('beforeend', `
				<div class="resize-dimentions hidden"></div>
				<div class="resize" draggable="true" title="Resize Graph"></div>
			`);

			const resize = report.container.querySelector('.resize');

			resize.on('dragstart', e => {
				e.stopPropagation();
				this.page.loadedVisualizations.beingResized = report
			});

			resize.on('dragend', e => {
				e.stopPropagation();
				this.page.loadedVisualizations.beingResized = null;
			});
		}

		Dashboard.container.parentElement.on('dragover', e => {

			e.preventDefault();
			e.stopPropagation();

			const report = this.page.loadedVisualizations.beingResized;

			if (!report) {
				return;
			}

			let format = report.format || {};

			if (!format.format) {
				format.format = {};
			}

			const
				visualizationFormat = format.format,
				columnStart = getColumn(report.container.offsetLeft),
				newColumn = getColumn(e.clientX) + 1,
				rowStart = getRow(report.container.offsetTop),
				newRow = getRow(e.pageY) + 1;

			if (newRow > rowStart) {
				visualizationFormat.height = newRow - rowStart;
			}

			if (newColumn > columnStart && newColumn <= Dashboard.grid.columns) {
				visualizationFormat.width = newColumn - columnStart;
			}

			if (
				visualizationFormat.width != report.container.style.gridColumnEnd.split(' ')[1] ||
				visualizationFormat.height != report.container.style.gridRowEnd.split(' ')[1]
			) {

				const dimentions = report.container.querySelector('.resize-dimentions');

				dimentions.classList.remove('hidden');
				dimentions.textContent = `${visualizationFormat.width} x ${visualizationFormat.height}`;

				report.container.setAttribute('style', `
					order: ${report.selectedCanvasVisualization.format.position || 0};
					grid-column: auto / span ${visualizationFormat.width || Dashboard.grid.columns};
					grid-row: auto / span ${visualizationFormat.height || Dashboard.grid.rows};
				`);

				if (this.dragTimeout) {
					clearTimeout(this.dragTimeout);
				}

				this.dragTimeout = setTimeout(() => report.visualizations.selected.render({resize: true}), 100);

				if (this.saveTimeout) {
					clearTimeout(this.saveTimeout);
				}

				this.saveTimeout = setTimeout(() => this.save(visualizationFormat, report.selectedCanvasVisualization.id), 1000);
			}
		});

		function getColumn(position) {
			return Math.floor(
				(position - Dashboard.container.offsetLeft) /
				((Dashboard.container.clientWidth / Dashboard.grid.columns))
			);
		}

		function getRow(position) {
			return Math.floor((position - Dashboard.container.offsetTop) / Dashboard.grid.rowHeight);
		}
	}

	async load() {

		if (this.format && (this.format.category_id || this.format.tags)) {

			this.page.searchBarFilter.clear();

			this.getCategoryFilter();

			this.getTagFilters();

			this.page.renderList();

			await Sections.show('list');

			//removing selected from other containers
			for (const element of this.page.container.querySelectorAll('.selected') || []) {
				element.classList.remove('selected');
			}

			return this.page.container.querySelector('#dashboard-' + this.id).parentNode.querySelector('.label').classList.add('selected');
		}

		//no need for dashboard.format

		try {
			this.globalFilters = new DashboardGlobalFilters(this);

			await this.globalFilters.load();
		}
		catch (e) {
			console.log(e);
		}

		this.page.container.querySelector('#reports .side').classList.toggle('hidden', (!this.globalFilters.size || this.page.account.settings.get('global_filters_position') == 'top'));
	}

	async render(resize) {

		if (this.format && (this.format.category_id || this.format.tags)) {
			return;
		}

		this.page.container.querySelector('#reports .side').classList.toggle('hidden', (!this.globalFilters.size || this.page.account.settings.get('global_filters_position') == 'top'));

		Sections.show('reports');

		await API.refreshToken();

		const dashboardName = this.page.container.querySelector('.dashboard-name');

		dashboardName.innerHTML = `
			<span>${this.page.parents(this.id).filter(x => this.page.list.has(x)).map(x => this.page.list.get(x).name).reverse().join(`<span class="NA">&rsaquo;</span>`)}</span>
			<div>
				<span class="toggle-dashboard-toolbar"><i class="fas fa-ellipsis-v"></i></span>
			</div>
		`;

		dashboardName.classList.remove('hidden');

        dashboardName.querySelector('.toggle-dashboard-toolbar').on('click', () => Dashboard.toolbar.classList.toggle('hidden'));

		this.page.render({dashboardId: this.id, renderNav: false, updateNav: true, reloadDashboard: false});

		const main = document.querySelector('main');

		this.visualizationTrack = new Map;

		Dashboard.container.textContent = null;

		for (const queryDataSource of this.visibleVisuliaztions) {

			queryDataSource.container.appendChild(queryDataSource.selectedVisualization.container);

			Dashboard.container.appendChild(queryDataSource.container);

			Dashboard.container.classList.remove('singleton');

			this.visualizationTrack.set(queryDataSource.selectedVisualization.visualization_id, ({
				position: queryDataSource.container.getBoundingClientRect().y,
				query: queryDataSource,
				loaded: false,
			}));
		}

		this.maxScrollHeightAchieved = Math.max(Dashboard.screenHeightOffset, main.scrollTop);

		this.globalFilters.apply({dontLoad: true});
		this.lazyLoad(this.maxScrollHeightAchieved, resize);

		document.addEventListener('scroll',

			() => {

				for (const queryDataSource of this.visibleVisuliaztions) {

					if (this.visualizationTrack.get(queryDataSource.selectedVisualization.visualization_id)) {

						this.visualizationTrack.get(queryDataSource.selectedVisualization.visualization_id).position = queryDataSource.container.getBoundingClientRect().y;
					}
				}

				this.maxScrollHeightAchieved = Math.max(main.scrollTop, this.maxScrollHeightAchieved);
				this.lazyLoad(resize,);

			}, {
				passive: true
			}
		);

		if (!this.page.loadedVisualizations.size) {
			Dashboard.container.innerHTML = '<div class="NA no-reports">No reports found!</div>';
		}

		if (this.page.user.privileges.has('report')) {

			const edit = Dashboard.toolbar.querySelector('#edit-dashboard');

			edit.classList.remove('hidden');
			edit.innerHTML = `<i class="fa fa-edit"></i> Edit`;

			edit.removeEventListener('click', Dashboard.toolbar.editListener);

			edit.on('click', Dashboard.toolbar.editListener = () => {
				this.edit()
			});

			if (Dashboard.editing) {
				edit.click();
			}

			const configure = Dashboard.toolbar.querySelector('#configure');
			configure.on('click', () => location.href = `/dashboards-manager/${this.id}`);
			configure.classList.remove('hidden');
		}

		Dashboard.toolbar.querySelector('#mailto').classList.remove('selected');
		this.page.reports.querySelector('.mailto-content').classList.add('hidden');

		const mailto = Dashboard.toolbar.querySelector('#mailto');

		if (this.page.account.settings.get('enable_dashboard_share')) {
			mailto.classList.remove('hidden');
		}

		if (Dashboard.mail_listener) {
			mailto.removeEventListener('click', Dashboard.mail_listener);
		}

		mailto.on('click', Dashboard.mail_listener = () => {
			mailto.classList.toggle('selected');
			this.mailto();
		});

		if((Dashboard.selectedValues && Dashboard.selectedValues.size && this.globalFilters.size) || this.globalFilters.validGlobalFilters) {
			this.globalFilters.apply();
		}
	}

	async save(format, id) {

		Dashboard.editing = false;

		const
			parameters = {
				id: id,
				owner: 'dashboard',
				owner_id: this.id,
				format: JSON.stringify(format || this.format),
			},
			options = {
				method: 'POST',
			};

		await API.call('reports/dashboard/update', parameters, options);
	}

	getCategoryFilter() {

		if(!this.format.category_id) {

			return;
		}

		const categoryFilter = new SearchColumnFilter(this.page.searchBarFilter);

		this.page.searchBarFilter.add(categoryFilter);

		this.page.searchBarFilter.render();

		categoryFilter.json = {
			searchQuery: MetaData.categories.has(this.format.category_id) ? MetaData.categories.get(this.format.category_id).name : '',
			searchValue: 'Category',
			searchType: 'equalto',
		};
	}

	getTagFilters() {

		if(!this.format.tags || !this.format.tags.length) {

			return;
		}

		for(const tag of this.format.tags) {

			const tagFilter = new SearchColumnFilter(this.page.searchBarFilter);

			this.page.searchBarFilter.add(tagFilter);

			tagFilter.json = {
				searchQuery: tag,
				searchValue: 'Tags',
				searchType: 'equalto',
			};
		}

		this.page.searchBarFilter.render();
	}
}

class Navbar {

	constructor(dashboards, page) {

		this.dashboards = dashboards;
		this.page = page;

		this.list = new Map;

		if (this.dashboards.values()) {

			for (const dashboard of this.dashboards.values()) {

				if (!dashboard.parent) {
					this.list.set(dashboard.id, new Nav(dashboard.id, dashboard));
				}
			}

			for (const dashboard of dashboards.values()) {
				this.list.set(dashboard.id, new Nav(dashboard, this.page));
			}
		}
	}

	render() {

		const dashboardHirachy = this.page.nav.querySelector('.dashboard-hierarchy');
		const search = this.page.nav.querySelector('.dashboard-search');

		dashboardHirachy.textContent = null;

		for (const dashboardItem of this.list.values()) {

			if (!dashboardItem.dashboard.parent) {
				dashboardHirachy.append(dashboardItem.menuItem);
			}
		}

		if (dashboardHirachy.querySelectorAll('.item:not(.hidden)').length > 40) {
			search.classList.remove('hidden');
		}

		search.removeEventListener('keyup', this.navSearch);

		search.on('keyup', this.navSearch = () => {

			const searchItem = search.querySelector("input[name='search']").value;

			this.page.render({dashboardId: 0, renderNav: true});

			if (!searchItem.length) {

				return this.page.render({
					dashboardId: this.page.currentDashboard,
					renderNav: true,
					updateNav: true,
					reloadDashboard: false
				});
			}

			let matching = [];

			for (const dashboard of this.dashboards.values()) {

				if (dashboard.name.toLowerCase().includes(searchItem.toLowerCase())) {

					matching = matching.concat(this.page.parents(dashboard.id).map(x => '#dashboard-' + x));

					const re = new RegExp(searchItem, 'ig');

					this.page.nav.querySelector('#dashboard-' + dashboard.id).innerHTML = dashboard.name.replace(re, '<mark>$&</mark>');
				}
			}

			let toShowItems = [];

			try {
				toShowItems = this.page.nav.querySelectorAll([...new Set(matching)].join(', '));
			}
			catch (e) {}

			for (const item of toShowItems) {

				const submenu = item.parentNode.querySelector('.submenu');

				if (submenu) {
					submenu.classList.remove('hidden');
				}

				item.querySelector('.angle') ? item.querySelector('.angle').classList.add('down') : {};
			}
		}, {passive: true});
	}
}

class Nav {

	constructor(dashboard, page) {

		this.dashboard = dashboard;
		this.page = page;
	}

	get menuItem() {

		const
			container = this.container = document.createElement('div'),
			allVisualizations = this.childrenVisualizations(this.dashboard);

		let icon;

		if (this.dashboard.icon && this.dashboard.icon.startsWith('http')) {
			icon = `<img src="${this.dashboard.icon}" height="20" width="20">`;
		}

		else if (this.dashboard.icon && this.dashboard.icon.startsWith('fa')) {
			icon = `<i class="${this.dashboard.icon}"></i>`
		}

		else {

			icon = '';
		}

		container.classList.add('item');

		if (!allVisualizations.length && (!this.dashboard.format || (!parseInt(this.dashboard.format.category_id)) && !this.dashboard.format.tags)) {
			container.classList.add('hidden');
		}

		container.innerHTML = `
			<div class="label" id=${'dashboard-' + this.dashboard.id}>
				${icon}
				<span class="name">${this.dashboard.name}</span>
				${this.dashboard.children.size ? '<span class="angle"><i class="fa fa-angle-right"></i></span>' : ''}
			</div>
			${this.dashboard.children.size ? '<div class="submenu hidden"></div>' : ''}
		`;

		const submenu = container.querySelector('.submenu');

		for (const child of this.dashboard.children.values()) {
			submenu.appendChild(this.page.navbar.list.get(child.id).menuItem);
		}

		if (this.dashboard.format && this.dashboard.format.hidden) {
			container.classList.add('hidden');
		}

		container.querySelector('.label').on('click', e => {

			if(e.ctrlKey || e.metaKey) {
				return window.open('/dashboard/' + this.dashboard.id);
			}

			this.page.render({
				dashboardId: this.dashboard.visualizations.length || (this.dashboard.format && (this.dashboard.format.category_id || this.dashboard.format.tags)) ? this.dashboard.id : 0,
				renderNav: false,
				updateNav: false
			});

			if (this.dashboard.page.container.querySelector('nav.collapsed')) {
				this.dashboard.page.render({dashboardId: this.dashboard.id});
			}

			if (this.dashboard.children.size) {
				container.querySelector('.angle').classList.toggle('down');
				submenu.classList.toggle('hidden');
			}

		});

		if (this.dashboard.children.size) {

			container.querySelector('.angle').on('click', (e) => {

				e.stopPropagation();
				container.querySelector('.angle').classList.toggle('down');

				container.parentElement.querySelector('.submenu').classList.toggle('hidden');
			})
		}

		return container;

	}

	childrenVisualizations(dashboard) {

		let visibleVisuliaztions = [];

		function getChildrenVisualizations(dashboard) {

			visibleVisuliaztions = visibleVisuliaztions.concat([...dashboard.visibleVisuliaztions]);

			for (const child of dashboard.children.values()) {
				getChildrenVisualizations(child);
			}
		}

		getChildrenVisualizations(dashboard);

		return visibleVisuliaztions;
	}
}

class DashboardGlobalFilters extends DataSourceFilters {

	constructor(dashboard) {

		const globalFilters = new Map;

		for (const visualization of dashboard.visibleVisuliaztions) {

			for (const filter of visualization.filters.values()) {

				if (!Array.from(MetaData.globalFilters.values()).some(a => a.placeholder.includes(filter.placeholder))) {
					continue;
				}

				const globalFilter = Array.from(MetaData.globalFilters.values()).filter(a => a.placeholder.includes(filter.placeholder));

				for (const value of globalFilter) {

					let offset = [];

					if(!isNaN(parseInt(value.offset))) {

						offset = [{
							value: parseInt(value.offset),
							unit: value.type == 'month' ? 'month' : 'day',
							direction: 1,
							snap: true,
						}];
					};

					globalFilters.set(value.placeholder, {
						name: value.name,
						placeholder: value.placeholder[0],
						placeholders: value.placeholder,
						default_value: value.default_value,
						dataset: value.dataset,
						multiple: value.multiple,
						offset: offset,
						order: value.order,
						type: value.type,
					});
				}
			}
		}

		if(!Dashboard.filtersAppliedByUser && dashboard.filters.length) {

			for(const [key, globalFilter] of globalFilters) {

				const dashboardFilter = dashboard.filters.filter(f => key.includes(f.placeholder))[0];

				if(!dashboardFilter) {
					continue;
				}

				let offset = [];

				if(!isNaN(parseInt(dashboardFilter.offset))) {

					offset = [{
						value: parseInt(dashboardFilter.offset),
						unit: dashboardFilter.type == 'month' ? 'month' : 'day',
						direction: 1,
						snap: true,
					}];
				}

				globalFilter.default_value = dashboardFilter.default_value;
				globalFilter.dataset = dashboardFilter.dataset;
				globalFilter.multiple = dashboardFilter.multiple;
				globalFilter.offset = offset;
				globalFilter.order = dashboardFilter.order;
				globalFilter.type = dashboardFilter.type;
				globalFilter.name = dashboardFilter.name;
			}
		}

		super(Array.from(globalFilters.values()));

		this.dashboard = dashboard;
		this.page = this.dashboard.page;
		this.globalFilterContainer = this.page.container.querySelector('#reports .global-filters');

		this.globalFilterContainer.classList.add(this.page.account.settings.get('global_filters_position') || 'right');

		document.removeEventListener('scroll', DashboardGlobalFilters.scrollListener);
		document.addEventListener('scroll', DashboardGlobalFilters.scrollListener = e => {
			this.globalFilterContainer.classList.toggle('scrolled', this.globalFilterContainer.getBoundingClientRect().top == 50);
		}, {passive: true});
	}

	async load() {

		await this.fetch();

		await this.render();

		this.validGlobalFilters = false;

		for(const [key, filter] of this) {

			if(this.page.urlSearchParameters.has(key)) {

				this.validGlobalFilters = true;
				filter.value = this.page.urlSearchParameters.get(key)
			}
		}

		if(Dashboard.filtersAppliedByUser && Dashboard.selectedValues.size) {

			for(const [key, value] of Dashboard.selectedValues) {

				if(this.has(key)) {
					this.get(key).value = value;
				}
			}
		}
	}

	async fetch() {

		const promises = [];

		for (const filter of this.values()) {
			promises.push(filter.fetch());
		}

		await Promise.all(promises);
	}

	async render() {

		const container = this.globalFilterContainer;

		container.textContent = null;

		container.classList.remove('show');
		container.classList.toggle('hidden', !this.size);

		if (!this.size) {
			return;
		}

		container.innerHTML = `
			<div class="head heading">
				<i class="fas fa-filter"></i>
				<input type="search" placeholder="Global Filters" class="global-filter-search">
				<button class="reload icon" title="Apply the filters and reload the dashboard without cache."><i class="fas fa-sync"></i></button>
			</div>
			<div class="NA no-results hidden">No filters found!</div>
		`;

		if(window.globalFilterSubmitListener) {
			this.container.removeEventListener('submit', Dashboard.globalFilterSubmitListener);
		}

		this.container.removeEventListener('submit', this.submitListener);

		this.container.on('submit', e => {

			e.preventDefault();

			Dashboard.filtersAppliedByUser = true;

			this.apply({userApplied: true});

			if(this.source) {
				this.source.container.querySelector('.filters-toggle').click()
			}
		});

		container.appendChild(this.container);

		const searchInput = container.querySelector('.global-filter-search');

		searchInput.on('keyup', () => {

			for (const filter of this.values()) {

				filter.label.classList.remove('hidden');

				if (!filter.name.toLowerCase().trim().includes(searchInput.value.toLowerCase().trim())) {
					filter.label.classList.add('hidden');
				}
			}

			const shown = container.querySelectorAll('.filters > label:not(.hidden)');

			container.querySelector('.no-results').classList.toggle('hidden', shown.length > 1);
		});

		container.querySelector('button.reload').on('click', () => {

			Dashboard.filtersAppliedByUser = true;

			this.apply({cached: 0, userApplied: true});
		});
	}

	async apply(options = {}) {

		let filterFound = false;

		for (const report of this.dashboard.visibleVisuliaztions) {

			let found = false;

			for (const filter of report.filters.values()) {

				let [matchingFilter] = Array.from(this.values()).filter(gfl => gfl.placeholders.includes(filter.placeholder))

				if (!matchingFilter) {
					continue;
				}

				filterFound = true;

				filter.value = matchingFilter.value;

				found = true;

				if(options.userApplied) {
					matchingFilter.changed({state: 'submitted'});
				} else {
					matchingFilter.changed({state: 'clear'});
				}
			}

			if (options.dontLoad) {
				continue;
			}

			if (found && Array.from(this.page.loadedVisualizations).some(v => v.query == report)) {
				report.visualizations.selected.load({clearFilterChanged: true});
			}

			report.visualizations.selected.subReportDialogBox = null;
			report.container.style.opacity = found ? 1 : 0.4;
		}

		if(Dashboard.filtersAppliedByUser && filterFound) {

			// Save the value of each filter for use on other dashboards
			for (const [placeholder, filter] of this) {

				Dashboard.selectedValues.set(placeholder, filter.value);
			}
		}
	}
}

Dashboard.selectedValues = new Map;