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

		const nav = this.getTitle(this.list, what);

		return nav.title.click();
	}

	getTitle(list, what) {

		if(list.has(parseInt(what))) {
			return list.get(parseInt(what));
		}

		let title;

		for(const x of list.values()) {

			if(!x.children.size) {
				continue;
			}

			title = this.getTitle(x.children, what);

			if(title) {
				return title;
			}
		}
	}

	setup() {

		this.container.textContent = null;
		this.container.appendChild(this.section);
	}

	async load() {

		this.list.clear();

		const response = await API.call('documentation/get');

		const root = this.constructTree(response);

		for(const data of root) {
			this.list.set(data.id, new Nav(data, this));
		}

		this.render();
	}

	render() {

		const
			list = this.section.querySelector('.container .list');

		for(const nav of this.list.values()) {
			list.appendChild(nav.title);
		}
	}

	constructTree(list) {

		const dataMap = new Map;

		for(const data of list) {

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

class Documentation {

	constructor(documentation, page, parent) {

		Object.assign(this, documentation);
		this.parent = parent;
		this.page = page;
	}

	async load() {

		if(this.body) {
			return;
		}

		const response = await API.call('documentation/get', {id: this.id});

		this.bodyx = response;
		this.indexSize = 1;
	}

	get container() {

		const container =  document.createElement('div');
		container.classList.add('documentation');

		container.innerHTML = `
			<div class="heading"><h${this.headingSize}>${this.completeChapter} ${this.heading}</h${this.headingSize}></div>
			<p>${this.body || '<span class="NA">No content added.</span>'}</p>
		`;

		if(this.children.size) {

			const subContent = document.createElement('div');
			subContent.classList.add('subContent');

			for(const child of this.children.values()) {

				subContent.appendChild(child.container);
			}

			container.appendChild(subContent);
		}

		return container;
	}

	set indexSize(size) {

		this.headingSize = size;

		if(!this.children.size) {
			return;
		}

		size++;

		for(const child of this.children.values()) {
			child.indexSize = size;
		}
	}

	set bodyx(text) {

		this.body = text.filter(x => x.id == this.id)[0].body;

		if(!this.children.size) {
			return;
		}

		for(const child of this.children.values()) {
			child.bodyx = text;
		}
	}

	get completeChapter() {

		let parent = this.parent;
		const a = [this.chapter];

		while(parent) {
			a.push(parent.chapter);
			parent = parent.parent;
		}

		return a.reverse().join('.');
	}
}

class Nav extends Documentation {

	constructor(documentation, page, parent = null) {

		super(documentation, page, parent);

		const children = new Map;

		for(const data of this.children) {
			children.set(data.id, new Nav(data, this.page, this));
		}

		this.children = children;
	}

	get title() {

		if(this.titleElement) {
			return this.titleElement;
		}

		const container = this.titleElement = document.createElement('div');
		container.classList.add('menu');

		container.innerHTML = `<span class="id">${super.completeChapter}</span> <a>${this.heading}</a>`;

		if(this.children.size) {

			const submenu = document.createElement('div');
			submenu.classList.add('submenu');

			for(const nav of this.children.values()) {
				submenu.appendChild(nav.title);
			}

			container.appendChild(submenu);
		}

		container.on('click', async (e) => {

			e.stopPropagation();

			if(this.page.container.querySelector('.list .selected')) {
				this.page.container.querySelector('.list .selected').classList.remove('selected');
			}

			container.classList.add('selected');

			history.pushState(null, '', this.id);

			if(this.page.container.querySelector('.documentation')) {
				this.page.container.querySelector('.documentation').remove();
			}

			await this.load();

			this.page.container.querySelector('.container').appendChild(this.container);
		});

		return container;
	}
}
