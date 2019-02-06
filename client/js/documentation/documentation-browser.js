class DocumentationBrowser extends Page {

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

		if(!what || isNaN(parseInt(what))) {
			return [...this.list.values()][0].title.querySelector('.item').click();
		}

		const nav = this.findItem(this.list, what);

		return nav.title.querySelector('.item').click();
	}

	findItem(list, id) {

		if(list.has(parseInt(id))) {
			return list.get(parseInt(id));
		}

		for(const child of list.values()) {

			if(!child.children.size) {
				continue;
			}

			const title = this.findItem(child.children, id);

			if(title) {
				return title;
			}
		}
	}

	setup() {

		this.container.textContent = null;
		this.container.innerHTML = `
			<section class="container">
				<nav></nav>
				<div class="documentation"></div>
			</section>
		`;
	}

	async load() {

		this.list.clear();

		const response = await API.call('documentation/get');

		const root = this.constructTree(response);

		root.sort((a,b) => a.chapter - b.chapter);

		for(const data of root) {
			this.list.set(data.id, new DocumentationBrowserItem(data, this));
		}

		this.render();
	}

	render() {

		const
			list = this.container.querySelector('.container nav');

		for(const nav of this.list.values()) {
			list.appendChild(nav.title);
		}
	}

	constructTree(list) {

		const tree = new Map;

		for(const documentation of list) {

			if(!tree.has(documentation.parent)) {
				tree.set(documentation.parent, []);
			}

			tree.get(documentation.parent).push(documentation);
		}

		for(const documentation of tree.values()) {

		    for(const subDocumentation of documentation) {
				subDocumentation.children = tree.get(subDocumentation.id) || [];
			}
		}

		return tree.get(null);
	}
}

Page.class = DocumentationBrowser;

class DocumentationBrowserItem extends Documentation {

	constructor(documentation, page, parent = null) {

		super(documentation, page, parent);

		const children = new Map;

		this.children.sort((a,b) => a.chapter - b.chapter);

		for(const data of this.children) {
			children.set(data.id, new DocumentationBrowserItem(data, this.page, this));
		}

		this.children = children;
	}

	get title() {

		if(this.titleElement) {
			return this.titleElement;
		}

		const container = this.titleElement = document.createElement('div');
		container.classList.add('menu');

		container.innerHTML = `
			<div class="item">
				<span class="id">${this.completeChapter}</span>
				<a>${this.heading}</a>
			</div>
		`;

		if(this.children.size) {

			const submenu = document.createElement('div');
			submenu.classList.add('submenu');

			for(const child of this.children.values()) {

				let
					parent = this.parent,
					level = 1;

				while(parent) {
					level++;
					parent = parent.parent;
				}

				child.title.querySelector('.item').style.paddingLeft = level * 20 + 'px';

				submenu.appendChild(child.title);
			}

			container.appendChild(submenu);
		}

		const item = container.querySelector('.item');

		item.on('click', async () => {

			if(this.page.container.querySelector('nav .selected')) {
				this.page.container.querySelector('nav .selected').classList.remove('selected');
			}

			item.classList.add('selected');

			history.pushState(null, '', `/documentation/${this.id}`);

			const documentation = this.page.container.querySelector('.documentation');
			documentation.textContent = null;

			await this.load({set_body: true});

			this.headingSize = 1;

			documentation.appendChild(this.container);
		});

		return container;
	}
}