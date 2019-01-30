class Documentations extends Page {

	constructor() {

		super();

		window.on('popstate', e => this.loadState(e.state));

		this.list = new Map;

		this.setup();

		(async () => {

			await this.load();
			this.loadState();
		})();
	}

	loadState(state) {

		let what = state ? state.what : location.pathname.split('/').pop();

		if(!what) {
			return [...this.list.values()][0].title.click();
		}

		return this.list.get(parseInt(what)).title.click();
	}

	setup() {

		this.container.textContent = null;
		this.container.appendChild(this.section);
	}

	async load() {

		this.list.clear();

		const response = await API.call('documentation/get');

		for(const data of response) {
			this.list.set(data.id, new Nav(data, this));
		}

		this.render();
	}

	render() {

		const
			list = this.section.querySelector('.container .list'),
			hierarchy = this.constructTree(this.list);

		for(const nav of hierarchy) {
			list.appendChild(nav.menu);
		}
	}

	constructTree(list) {

		const dataMap = new Map;

		for(const data of list.values()) {

			const parent = data.parent || 'root';

			if(!dataMap.has(parent)) {
				dataMap.set(parent, []);
			}

			dataMap.get(parent).push(data);
		}

		for(const [key, value] of dataMap) {

		    for(const _val of value) {
				_val.children = dataMap.get(_val.id) || [];
			}
		}

		return dataMap.get('root');
	}

	get section() {

		if(this.sectionElement) {
			return this.sectionElement;
		}

		const container = this.sectionElement = document.createElement('section');

		container.innerHTML = `
			<div class="container">
				<div class="list"></div>
			</div>
		`;

		return container;
	}
}

Page.class = Documentations;

class Nav {

	constructor(documentation, page) {

		Object.assign(this, documentation);
		this.page = page;
		this.list = new Map;
	}

	get title() {

		if(this.titleElement) {
			return this.titleElement;
		}

		const container = this.titleElement = document.createElement('div');
		container.classList.add('menu');

		container.innerHTML = '';

		container.on('click', async (e) => {

			e.stopPropagation();

			if(this.page.container.querySelector('.list .selected')) {
				this.page.container.querySelector('.list .selected').classList.remove('selected');
			}

			container.classList.add('selected');

			history.pushState(null, '', this.id);

			if(!this.list.size) {
				this.list.set(this.id, new Documentation(this.id, this.page));
			}

			await this.list.get(this.id).load();

			const content = this.page.container.querySelector('.container');

			if(content.querySelector('.documentation')) {
				content.querySelector('.documentation').remove();
			}

			content.appendChild(this.list.get(this.id).container);
		});

		return container;
	}

	set index(text) {

		this.title.innerHTML = `<span class="id">${text}</span> <a>${this.heading}</a>`
	}

	get index() {

		return this.title.querySelector('.id').textContent;
	}

	get menu() {

		if(this.menuElement) {
			return this.menuElement;
		}

		const container = this.menuElement = document.createDocumentFragment();

		container.appendChild(this.constructMenu(this, [this.id], 0));

		return container;
	}

	constructMenu(documentation, index, level) {

		const item = document.createElement('div');
		item.classList.add('item');

		if(!documentation.children.length) {
			documentation.index = index.join('.');
			item.appendChild(documentation.title);
			return item;
		}

		documentation.children.sort((a,b) => a.chapter - b.chapter);

		documentation.index = index.join('.');

		const children = document.createElement('div');

		children.classList.add('children');

		for(const _documentation of documentation.children) {

			index.push(_documentation.chapter)

			level++;

			_documentation.title.style['padding-left'] = level * 20 + 'px';

			children.appendChild(this.constructMenu(_documentation, index, level));

			index.pop();

			level--;
		}

		item.appendChild(documentation.title);
		item.appendChild(children);

		return item;
	}
}

class Documentation {

	constructor(id, page) {

		this.id = id;
		this.list = new Map;
		this.page = page;
	}

	async load() {

		if(this.list.size) {
			return;
		}

		const response = await API.call('documentation/get', {id: this.id});

		for(const documentation of response) {
			this.list.set(documentation.id, new Doc(documentation, this.page));
		}
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');
		container.classList.add('documentation');

		container.appendChild(this.prepareDocumentation(this.page.list.get(this.chapter), this.id, 1));

		return container;
	}

	prepareDocumentation(nav, id, headingSize) {

		this.list.get(id).container.querySelector('div').innerHTML = `
			<h${headingSize}>${nav.index} <a>${nav.heading} </a></h${headingSize}>
		`;

		if(!nav.children.length) {
			return this.list.get(id).container
		}

		if(headingSize <= 6) {
			headingSize++;
		}

		for(const _nav of nav.children) {

			this.list.get(_nav.id).container.querySelector('div').innerHTML = `<h${headingSize}>${_nav.index} <a>${_nav.heading} </a></h${headingSize}>`;

			this.list.get(id).container.appendChild(this.list.get(_nav.id).container);
			this.prepareDocumentation(_nav, _nav.id, headingSize);
		}

		return this.list.get(id).container;
	}
}

class Doc {

	constructor(documentation, page) {

		Object.assign(this, documentation);

		this.page = page;
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');
		container.classList.add('body');

		container.innerHTML = `
			<div></div>
			<p>${this.body || '<span class="NA">No content added.</span>'}</p>
		`;

		return container;
	}
}
