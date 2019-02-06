"use strict";

if(typeof window != 'undefined') {
	window.addEventListener('DOMContentLoaded', async () => {

		await Page.setup();

		if(!user || !user.privileges.has('superadmin')) {

			console.log(`%c
								   _ _  _____                  _
							 /\\   | | |/ ____|                | |
							/  \\  | | | (___  _ __   __ _ _ __| | __
						   / /\\ \\ | | |\\___ \\| '_ \\ / _\` | '__| |/ /
						  / ____ \\| | |____) | |_) | (_| | |  |   <
						 /_/    \\_\\_|_|_____/| .__/ \\__,_|_|  |_|\\_\\
											 | |
											 |_|
						   %cWelcome to the source, enjoy your stay.
				Find the entire code at https://github.com/Jungle-Works/AllSpark
			`, 'color: #f33; font-weight: bold;', 'color: #777');
		}

		if(!Page.class) {
			return;
		}

		window.page = new (Page.class)();
	});
}

class Page {

	static async setup() {

		AJAXLoader.setup();

		await Page.load();

		if(await Storage.get('disable-custom-theme')) {
			document.querySelector('html > head link[href^="/css/custom.css"]').remove();
		}
	}

	static async load() {

		DialogBox.container = document.querySelector('body');

		await Storage.load();
		await Page.loadCredentialsFromURL();
		await Account.load();

		if(window.account && account.auth_api) {

			const parameters = new URLSearchParams(window.location.search.slice(1));

			if(account && parameters.get('external_parameters') && Array.isArray(account.settings.get('external_parameters'))) {

				User.logout({callback: async () => {

					const parameters_ = {};

					for(const [key, value] of parameters) {
						parameters_[key] = value;
					}

					await Storage.set('external_parameters', parameters_);
				}});
			}
		}

		await API.refreshToken();

		await User.load();
		await MetaData.load();

		Page.loadOnboardScripts();

		SnackBar.setup();
		NotificationBar.setup();
	}

	static async clearCache() {

		const refresh_token = await Storage.get('refresh_token');

		await Storage.clear();

		if(navigator.serviceWorker) {

			for(const registration of await navigator.serviceWorker.getRegistrations()) {
				registration.unregister();
			}
		}

		Storage.set('refresh_token', refresh_token);

		await API.refreshToken();
		await MetaData.load();
		await User.load();

		new SnackBar({
			message: 'Cache Cleared',
			subtitle: 'Reloaded website metadata, local cache and user access level information.',
			icon: 'fas fa-check',
		});
	}

	constructor({container = null} = {}) {

		this.container = container || document.querySelector('main');

		this.account = window.account;
		this.user = window.user;
		this.metadata = window.MetaData;
		this.indexedDb = IndexedDb.instance;
		this.cookies = Cookies;
		this.keyboardShortcuts = new Map;
		this.urlSearchParameters = new URLSearchParams(location.search);

		this.serviceWorker = new Page.serviceWorker(this);
		this.webWorker = new Page.webWorker(this);
		this.header = new PageHeader(this);

		if(container) {
			return;
		}

		this.renderPage();
		this.setupShortcuts();

		setTimeout(() => this.branchAlert());
	}

	/**
	* Checks which branch is deployed and throws alert if branch other than 'master' is deployed.
	*/
	branchAlert() {

		if(!window.environment) {
			return;
		}

		if(!user.privileges.has('superadmin') || environment.branch == 'master' || !environment.name.includes('production')) {
			return;
		}

		const message = new NotificationBar({
			message: `${environment.branch} is deployed on ${environment.name}. Please note.`,
			type: 'error',
		});
	}

	renderPage() {

		if(!this.account || !this.user) {
			return;
		}

		document.body.insertBefore(this.header.container, this.container);

		if(window.account) {

			if(account.icon) {
				document.getElementById('favicon').href = account.icon;
			}

			document.title = account.name;
		}
	}

	setupShortcuts() {

		document.on('keyup', async (e) => {

			if(!e.altKey) {
				return;
			}

			// Alt + K
			if(e.keyCode == 75 && document.querySelector('html > head link[href^="/css/custom.css"]')) {

				document.querySelector('html > head link[href^="/css/custom.css"]').remove();

				await Storage.set('disable-custom-theme', true);

				new SnackBar({
					message: 'Custom theme removed',
					icon: 'far fa-trash-alt',
				});
			}

			// Alt + L
			if(e.keyCode == 76) {
				User.logout();
			}

			// Alt + O
			if(e.keyCode == 79) {
				await Page.clearCache();
			}

		});

		this.keyboardShortcuts.set('Alt Twice', {
			title: 'See Available Keyboard Shortcuts',
		});

		// Alt + K
		if(document.querySelector('html > head link[href^="/css/custom.css"]')) {

			this.keyboardShortcuts.set('Alt + K', {
				title: 'Remove Custom Theme',
				description: 'Remove the custom theme set for this account',
			});
		}

		this.keyboardShortcuts.set('Alt + L', {
			title: 'Logout',
			description: 'Clear all local caches and logout as the current user',
		});

		this.keyboardShortcuts.set('Alt + O', {
			title: 'Clear Cache',
			description: 'Clear all local caches like metadata, filter datasets, offline data, etc',
		});

		document.on('keyup', e => {

			if(e.keyCode != 18) {
				return;
			}

			if(!this.keyboardShortcutsLastTap || Date.now() - this.keyboardShortcutsLastTap > 500) {
				return this.keyboardShortcutsLastTap = Date.now();
			}

			if(!this.keyboardShortcutsDialogBox) {

				this.keyboardShortcutsDialogBox = new DialogBox();

				this.keyboardShortcutsDialogBox.container.classList.add('keyboard-shortcuts');
				this.keyboardShortcutsDialogBox.heading = 'Keyboard Shortcuts';

				this.keyboardShortcutsDialogBox.body.textContent = null;

				for(const [keys, shortcut] of this.keyboardShortcuts) {

					this.keyboardShortcutsDialogBox.body.insertAdjacentHTML('beforeend', `
						<div class="shortcut">
							<div class="keys">${keys}</div>
							<div class="title">${shortcut.title}</div>
							${shortcut.description ? '<div class="description">' + shortcut.description + '</div>' : ''}
						</div>
					`);
				}
			}

			if(this.keyboardShortcutsDialogBox.status) {
				this.keyboardShortcutsDialogBox.hide();
			}

			else  {
				this.keyboardShortcutsDialogBox.show();
			}
		});
	}

	/**
	 * Load credentials from cookies if the server's request provided them.
	 * This is done when automatic login happens in third party integration scenerio.
	 */
	static async loadCredentialsFromURL() {

		const parameters = new URLSearchParams(window.location.search);

		if(!parameters.get('external_parameters'))
			return;

		await Storage.clear();

		await Storage.set('external_parameters', JSON.parse(parameters.get('external_parameters')));
		await Storage.set('refresh_token', parameters.get('refresh_token'));

		const searchParams = new URLSearchParams(window.location.search);

		searchParams.delete('external_parameters');
		searchParams.delete('refresh_token');
		searchParams.delete('token');

		window.history.replaceState({}, '', `${window.location.pathname}?${searchParams}`);
	}

	static async loadOnboardScripts() {

		if(!await Storage.get('newUser'))
			return;

		try {

			DataSource;
		}
		catch(e) {

			const script = document.createElement("script");

			script.src = '/js/reports.js';
			document.head.appendChild(script);
		}

		try {

			UserOnboard;
		}
		catch(e) {

			const
				onboardScript = document.createElement('script'),
				onboardCSS = document.createElement('link');

			onboardCSS.rel = 'stylesheet';
			onboardCSS.type = 'text/css';
			onboardCSS.href = '/css/user-onboard.css';

			onboardScript.src = '/js/user-onboard.js';
			document.head.appendChild(onboardScript);
			document.head.appendChild(onboardCSS);
		}
	}
}

class PageHeader {

	constructor(page) {

		this.page = page;

		this.globalSearch = new GlobalSearch();
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('header');

		container.innerHTML = `

			<a class="logo" href="/dashboard/first"><img src="${this.page.account.logo}"></a>

			<span class="user-toggle"><i class="fa fa-user"></i>&nbsp; ${this.page.user.name || ''}</span>

			<div class="user-popup hidden">
				<span class="name">${this.page.user.name}</span>
				<span class="email">${this.page.user.email}</span>
				<div class="links">
					<a href="/user/profile/${this.page.user.user_id}">Profile</a>
					<a href="/user/settings/${this.page.user.user_id}">Settings</a>
					<a href="#" class="logout">Logout</a>
				</div>
			</div>

			<div class="nav-toggle"><i class="fas fa-chevron-down"></i></div>

			<nav class="hidden"></nav>
		`;

		const
			navList = [
				{
					url: '/users-manager',
					name: 'Users',
					privileges: ['user.list', 'user'],
					icon: 'fas fa-users',
				},
				{
					url: '/dashboards-manager',
					name: 'Dashboards',
					privileges: [],
					icon: 'fa fa-newspaper',
				},
				{
					url: '/reports',
					name: 'Reports',
					privileges: [],
					icon: 'fa fa-database',
				},
				{
					url: '/visualizations-manager',
					name: 'Visualizations',
					privileges: [],
					icon: 'far fa-chart-bar',
				},
				{
					url: '/connections-manager',
					name: 'Connections',
					privileges: ['connection', 'connection.list'],
					icon: 'fa fa-server',
				},
				{
					url: '/settings',
					name: 'Settings',
					privileges: ['administrator', 'category.insert', 'category.update', 'category.delete'],
					icon: 'fas fa-cog',
				},
			],
			nav = container.querySelector('nav'),
			navToggle = container.querySelector('.nav-toggle'),
			userToggle = container.querySelector('.user-toggle'),
			userPopup = container.querySelector('.user-popup');

		for(const item of navList) {

			if((item.privileges.every(p => !this.page.user.privileges.has(p)) && item.privileges.length))
				continue;

			nav.insertAdjacentHTML('beforeend',`
				<a href="${item.url}" class="${window.location.pathname.startsWith(item.url) ? 'selected' : ''}">
					<i class="${item.icon}"></i>&nbsp;
					${item.name}
				</a>
			`);
		}

		container.insertBefore(this.globalSearch.container, userToggle);

		userToggle.on('click', e => {

			e.stopPropagation();

			nav.classList.add('hidden');
			navToggle.classList.remove('selected');

			userPopup.classList.toggle('hidden');
			userToggle.classList.toggle('selected');
		});

		navToggle.on('click', e => {

			e.stopPropagation();

			userPopup.classList.add('hidden');
			userToggle.classList.remove('selected');

			nav.classList.toggle('hidden');
			navToggle.classList.toggle('selected');

			this.globalSearch.container.classList.toggle('show');
			userPopup.classList.toggle('show');
		});

		container.querySelector('.logout').on('click', () => {

			Cookies.set('bypassLogin', '');

			User.logout();
		});

		userPopup.on('click', e => e.stopPropagation());

		document.on('click', () => {

			userPopup.classList.add('hidden');
			userToggle.classList.remove('selected');

			nav.classList.add('hidden');
			navToggle.classList.remove('selected');

			this.globalSearch.container.classList.remove('show');
			userPopup.classList.remove('show');
		});

		return container;
	}
}

Page.exception = class PageException extends Error {

	constructor(message) {

		super(message);

		this.message = message;

		ErrorLogs.send(this.message, null, null, null, this);
	}
}

/**
 * The main service worker for the website.
 */
Page.serviceWorker = class PageServiceWorker {

	constructor(page) {

		this.page = page;

		this.setup();
	}

	/**
	 * Register the service worker and save it's instance in the worker property.
	 */
	async setup() {

		if(!('serviceWorker' in navigator))
			return;

		this.worker = await navigator.serviceWorker.register('/service-worker.js');

		if(!this.status)
			return;

		navigator.serviceWorker.controller.addEventListener('statechange', e => this.statechange(e));

		window.on('online', () => this.online());
		window.on('offline', () => this.offline());

		// Update the offline status if needed but without the snackBar
		this.offline({snackBar: false});
	}

	/**
	 * Signifies that the service worker's state has been changed.
	 * This will show a banner on the site that lets the user know that the site has been updated
	 * and they need to reload the page to see fresh code.
	 *
	 * @param Object	event	The service worker's state change event.
	 */
	statechange(event = {}) {

		if(!user.privileges.has('superadmin'))
			return;

		if(event.target && event.target.state != 'redundant')
			return;

		setTimeout(() => {

			const message = new NotificationBar({
				message: 'The site has been updated in the background. Click here to reload the page.',
				type: 'error',
			});

			message.on('click', () => {
				window.location.reload();
			});

		}, 1000);
	}

	/**
	 * Removes the offline bar and shows an online notification.
	 */
	online() {

		if(!navigator.onLine)
			return;

		if(this.offlineMessage)
			this.offlineMessage.hide();

		new SnackBar({
			message: 'You\'re online!',
			subtitle: 'You can continue browsing freely.',
			icon: 'fas fa-wifi',
		});
	}

	/**
	 * Shows the offline bar and snackbar if needed.
	 *
	 * @param boolean	snackBar	Wether the snackbar will be shown or not.
	 */
	offline({snackBar = true} = {}) {

		if(navigator.onLine)
			return;

		this.offlineMessage = new NotificationBar({
			message: 'You\'re offline!',
			type: 'error',
		});

		if(!snackBar)
			return;

		new SnackBar({
			message: 'You\'re offline!',
			subtitle: 'Now you can only see things that were loaded atleast once before.',
			icon: 'fas fa-ban',
			type: 'error',
		});
	}

	/**
	 * Send a message to the service worker with an action and a body and return it's response.
	 *
	 * @param  sring	action	The unique string to identify the action on service worker's end.
	 * @param  any		body	The optional request body that the service worker will work on to prepare a response.
	 * @return Promise			That resolves when the worker is done with the request and has sent a response.
	 */
	async message(action, body = null) {

		if(!this.status)
			return false;

		return new Promise(resolve => {

			const channel = new MessageChannel();

			channel.port1.onmessage = event => resolve(event.data.response);

			navigator.serviceWorker.controller.postMessage({action, body}, [channel.port2]);
		});
	}


	/**
	 * Returns the status of the service worker in current environment.
	 *
	 * @return boolean
	 */
	get status() {
		return ('serviceWorker' in navigator) && navigator.serviceWorker.controller ? true : false;
	}

	async clear() {

		if(!this.status)
			return false;

		for(const registration of await navigator.serviceWorker.getRegistrations())
			registration.unregister();
	}
}

/**
 * A generic key value store that uses IndexedDb.
 *
 * Has support for basic Map based functions and gives
 * access to the database instance for further interaction.
 */
class IndexedDb {

	/**
	 * Set up the database connection if not done already.
	 */
	static async load() {

		if(IndexedDb.instance)
			return;

		IndexedDb.instance = new IndexedDb();

		await IndexedDb.instance.open();
	}

	/**
	 * Save a page's reference for use later.
	 *
	 * @param  Page	page	May be used to reference the current page.
	 */
	constructor(page) {
		this.page = page;
	}

	/**
	 * Open a database connection.
	 *
	 * @return Promise	Resolves when the connection is established successfuly.
	 */
	open() {

		return new Promise((resolve, reject) => {

			this.request = indexedDB.open('MainDb', 1);

			this.request.onupgradeneeded = e => this.setup(e.target.result);
			this.request.onsuccess = e => {

				this.db = e.target.result;

				this.db.onerror = e => {throw new Page.exception(e);}
				resolve();
			};

			this.request.onerror = e => {
				reject();
			};
		});
	}

	/**
	 * Set up the connection once it's created for the first time.
	 *
	 * This creates a store called MainStore that's the sole sotore that stores any data.
	 *
	 * @param  object	db	The database instance.
	 */
	setup(db) {
		db.createObjectStore('MainStore', {keyPath: 'key'});
	}

	/**
	 * Check if a key exists in the IndexedDb's main store.
	 *
	 * @param  string	key	The key to check.
	 * @return Promise		Resolves with true if the key exists, false otherwise.
	 */
	has(key) {

		return new Promise((resolve, reject) => {

			const request = this.db.transaction('MainStore').objectStore('MainStore').get(key);

			request.onsuccess = e => resolve(e.target.result ? true : false);
			request.onerror = e => resolve(false);
		});
	}

	/**
	 * Get the value stored at a specified key in the main store.
	 *
	 * @param  string	key	The key whose value will be fetched.
	 * @return Promise		Resolves with the value stored in the mian store.
	 */
	get(key) {

		return new Promise((resolve, reject) => {

			const request = this.db.transaction('MainStore').objectStore('MainStore').get(key);

			request.onsuccess = e => resolve(e.target.result ? e.target.result.value : undefined);
			request.onerror = e => resolve();
		});
	}

	/**
	 * Set the value at a specified key in the main store.
	 *
	 * @param string	key		The key of the new value.
	 * @param Object	value	Value for the key being passed.
	 * @return Promise			Resolves with the result when saved. Rejects otherwise.
	 */
	set(key, value) {

		return new Promise((resolve, reject) => {

			const request = this.db.transaction('MainStore', 'readwrite').objectStore('MainStore').put({key, value});

			request.onsuccess = e => resolve(e.result);
			request.onerror = e => reject(e);
		});
	}

	/**
	 * Delete the value stored at the specified key.
	 *
	 * @param  String	key	The key that will be deleted.
	 * @return Promise		That resolves when the item is successfuly deleted.
	 */
	delete(key) {

		return new Promise((resolve, reject) => {

			const request = this.db.transaction('MainStore', 'readwrite').objectStore('MainStore').delete(key);

			request.onsuccess = e => resolve(e.result);
			request.onerror = e => reject(e);
		});
	}
}

/**
 * A generic cookie map interface that lets us do basic CRUD tasks.
 */
class Cookies {

	/**
	 * Sets a new cookie with given name and value and overwrites any previously held values.
	 *
	 * @param  string	key		The name of the cookie being set.
	 * @param  string	Value	The value of the cookie being set.
	 * @return boolean			The status of the set request.
	 */
	static set(key, value) {
		document.cookie = `${key}=${encodeURIComponent(value)};path=/`;
		return true;
	}

	/**
	 * Checks if a cookie with the given name exists.
	 *
	 * @param  string	key	The name of the cookie whose existance is being questioned
	 * @return boolean		Returns true if the cookie exists, false otherwise
	 */
	static has(key) {
		return new Boolean(document.cookie.split(';').filter(c => c.includes(`${key}=`)).length);
	}

	/**
	 * Gets the value of a cookie with the given name.
	 *
	 * @param  string	key	The name of the cookie whose value will be retured.
	 * @return string		The	value of the cookie, null if not found.
	 */
	static get(key) {

		// TODO: Handle the prefix bug, (both foo and barfoo will be matched with current approach)
		const [cookie] = document.cookie.split(';').filter(c => c.includes(`${key}=`));

		if(!cookie)
			return null;

		return decodeURIComponent(cookie.split('=')[1]);
	}
}

/**
 * A generic storage API to store data throughout the project.
 * It switches the storage medium depending on the available media.
 * If IndexedDb is available that will be used. LocalStorage is used otherwise.
 */
class Storage {

	/**
	 * Set up the storage media.
	 * IndexedDb mostly.
	 *
	 * @return Promise	That resolves when the setup is complete.
	 */
	static async load() {

		try {
			await IndexedDb.load();
		} catch(e) {
			Storage.localStorage = true;
		}
	}

	/**
	 * Check if a key exists.
	 *
	 * @param  string	key	The key to check form.
	 * @return Boolean		True if found, false otherwise.
	 */
	static async has(key) {

		if(Storage.localStorage)
			return key in localStorage;

		else return await IndexedDb.instance.has(key);
	}

	/**
	 * Get a key's value.
	 * It takes care of encoding the data if needed (LocalSotorage).
	 *
	 * @param  string	key	The key whose value is being fetched.
	 * @return Object		The value for the key.
	 */
	static async get(key) {

		if(!await Storage.has(key))
			return undefined;

		if(!Storage.localStorage)
			return await IndexedDb.instance.get(key);

		try {
			return JSON.parse(localStorage[key]);
		} catch(e) {}

		return undefined;
	}

	/**
	 * Save a value at the specified key.
	 *
	 * @param string	key		The key that is being set.
	 * @param object	value	The value for the given key.
	 */
	static async set(key, value) {

		if(Storage.localStorage)
			return localStorage[key] = JSON.stringify(value);

		return await IndexedDb.instance.set(key, value);
	}

	/**
	 * Delete a key's value.
	 * @param string	key	The key whose data is bieng deleted.
	 */
	static async delete(key) {

		if(Storage.localStorage)
			return delete localStorage[key];

		return await IndexedDb.instance.delete(key);
	}

	/**
	 * Clear the storage completely.
	 */
	static async clear() {

		localStorage.clear();

		if(!Storage.localStorage)
			await IndexedDb.instance.db.transaction('MainStore', 'readwrite').objectStore('MainStore').clear();
	}
}

if(typeof Worker != 'undefined') {

	Page.webWorker = class PageWebWorker extends Worker {

		constructor(page) {

			super('/js/web-worker.js');

			this.page = page;
			this.requests = new Map();

			this.onmessage = e => this.message(e);
			this.onerror = e => this.error(e);
		}

		send(action, request) {

			const reference = Math.random();

			return new Promise(resolve => {

				this.requests.set(reference, response => resolve(response));

				this.postMessage({reference, action, request});
			});
		}

		message(e) {

			if(!this.requests.has(e.data.reference))
				throw new Page.exception(`Invalid web worker response for reference ${e.data.reference}`, e.data.response);

			this.requests.get(e.data.reference)(e.data.response);
		}

		error(e) {
			throw new Page.exception(e);
		}
	}
}

class GlobalSearch {

	constructor(page) {

		this.page = page
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');
		container.classList.add('global-search');

		container.innerHTML = `
			<input class="search-input" placeholder="Search...">
			<ul class="hidden"></ul>
		`;

		this.searchList = container.querySelector('ul');
		this.setEvents();

		return container;
	}

	setEvents() {

		this.searchInput = this.container.querySelector('input');

		document.body.on('click', () => {
			this.hide();
		});

		this.searchInput.on('click', (e) => {

			if(this.searchInput.value == '') {
				this.hide();
			}
			else {
				this.show();
			}
			e.stopPropagation();
		});

		this.searchInput.on('keyup', async (e) => {

			clearTimeout(GlobalSearch.inputTimeout);
			e.stopPropagation();

			if(this.searchInput.value == '') {
				this.hide();
				return;
			}

			GlobalSearch.inputTimeout = setTimeout( async () => {
				await this.fetch();
			}, 300);

			}
		);

		// this.container.on('keydown', Page.keyUpDownListenter = e => this.searchUpDown(e));
	}

	async fetch() {

		this.searchList.innerHTML = `<li><span class="loading"><i class="fa fa-spinner fa-spin"></i></span></li>`;

		const params = {
			text: this.searchInput.value,
			search: 'global',
		};

		const data = await API.call('search/query', params);
		this.render(data);
		this.show();
	}

	render(data) {

		this.searchList.textContent = null;

		for(const row of data) {

			const list_item = document.createElement('li');

			list_item.setAttribute('tabIndex', 0);

			list_item.innerHTML = `
				<a href="${row.href}" tabindex="-1">
					<span><strong>${row.name}</strong> in <strong>${row.superset}</strong></span>
				</a>
				<span class="li-edit"><i class="far fa-edit"></i></span>
			`;

			list_item.querySelector('.li-edit').on('click', () => {

				const href = {
					Reports : '/reports/configure-report/query_id',
					Dashboards : '/dashboards-manager/id',
					Users : '/users/user_id',
					Datasets : '/settings/datasets/id'
				};

				href[row.superset] = href[row.superset].split('/');
				const suffix = href[row.superset].pop();
				href[row.superset] = href[row.superset].join('/').concat(`/${row[suffix]}`);

				location.href = href[row.superset];

			});

			this.searchList.appendChild(list_item);
		}

		if(!data.length) {
			this.searchList.innerHTML = `<li><a href="#">No results found</a></li>`;
		}
	}

	show() {

		this.searchList.classList.remove('hidden');
		this.searchInput.classList.add('bottom-border');
	}

	hide() {

		this.searchList.classList.add('hidden');
		this.searchInput.classList.remove('bottom-border');
	}

	keyUpDown(e) {

		e.stopPropagation();

		if (e.which == 40) {
			this.active_li = this.active_li.nextElementSibling || this.active_li
		}
		else if (e.which == 38) {
			this.active_li = this.active_li.previousElementSibling || this.active_li;
		}
		else {
			return
		}

		this.active_li.focus();
	}
}

class Account {

	static async load() {

		const account = await Account.fetch();

		return window.account = account ? new Account(account) : null;
	}

	static async fetch() {

		if(await Storage.has('account')) {
			return await Storage.get('account');
		}

		try {

			await Storage.set('account', await API.call('accounts/get'));

		} catch(e) {
			return null;
		}

		return await Storage.get('account');
	}

	constructor(account) {

		for(const key in account) {
			this[key] = account[key];
		}

		this.settings = new Map;

		if(!Array.isArray(account.settings)) {
			return;
		}

		for(const setting of account.settings) {
			this.settings.set(setting.key, setting.value);
		}

		if(this.features && (this.features.length || this.features.size)) {
			this.features = new Map(this.features.map(f => [f, f]));
		}
	}
}

class User {

	static async load() {

		let user = null;

		const token = await Storage.get('token');

		try {
			const decodedToken = JSON.parse(atob(token.body.split('.')[1]));

			user = {...JSON.parse(decodeURIComponent(decodedToken.data)),
				iat: decodedToken.iat,
				exp: decodedToken.exp
			};

		} catch(e) {}

		window.user = new User(user);

		if(window.page)
			window.page.user = window.user;

		return;
	}

	static async logout({next, callback, redirect = true, message = ''} = {}) {

		Cookies.set('refresh_token', '');
		Cookies.set('token', '');

		try {

			const
				parameters = {
					user_id: user.user_id,
					type: 'logout',
					description: message,
				},
				options = {
					method: 'POST',
				};

			API.call('session-logs/insert', parameters, options);
		}
		catch(e) {}

		setTimeout(async() => {

			const parameters = new URLSearchParams();

			await Storage.clear();

			if(next)
				parameters.set('continue', window.location.pathname + window.location.search);

			if(callback)
				await callback();

			if(account && account.settings.get('logout_redirect_url') && redirect)
				window.open(account.settings.get('logout_redirect_url')+'?'+parameters.toString(), '_self');

			else if(redirect)
				window.location = '/login?'+parameters.toString();

		}, 100)
	}

	constructor(user) {

		for(const key in user)
			this[key] = user[key];

		this.id = this.user_id;
		this.privileges = new UserPrivileges(this);
		this.roles = new UserRoles(this);
	}
}

class UserPrivileges extends Set {

	constructor(context) {

		super(context.privileges);

		this.context = context;
	}

	has(name) {

		if([...this.values()].some(x => x.privilege_name == 'superadmin')) {

			return 1;
		}

		if(name === "superadmin") {

			return Array.from(this).filter(p => p.privilege_name.toLowerCase() == name.toLowerCase()).length;
		}

		return Array.from(this).filter(p => p.privilege_name.toLowerCase() == name.toLowerCase() || p.privilege_id === 0).length;
	}
}

class UserRoles extends Set {

	constructor(context) {

		super(context.roles);

		this.context = context;
	}
}

class MetaData {

	static async load() {

		MetaData.categories = new Map;
		MetaData.privileges = new Map;
		MetaData.roles = new Map;
		MetaData.datasources = new Map;
		MetaData.visualizations = new Map;
		MetaData.filterTypes = new Map;
		MetaData.features = new Set;
		MetaData.spatialMapThemes = new Map;
		MetaData.globalFilters = new Set;
		user.settings = new Map;

		if(!user.id)
			return;

		const metadata = await MetaData.fetch();

		MetaData.save(metadata);
	}

	static async fetch() {

		let
			metadata,
			timestamp;

		if(await Storage.has('metadata')) {
			try {
				({metadata, timestamp} = (await Storage.get('metadata')) || {});
			} catch(e) {}
		}

		if(navigator.onLine && (!timestamp || Date.now() - timestamp > MetaData.timeout)) {

			metadata = await API.call('users/metadata');

			await Storage.set('metadata', {metadata, timestamp: Date.now()})
		}

		return metadata;
	}

	static save(metadata = {}) {

		for(const privilege of metadata.privileges || []) {

			privilege.privilege_id = privilege.owner_id;
			delete privilege['owner_id'];

			MetaData.privileges.set(privilege.privilege_id, privilege);
		}

		for(const role of metadata.roles || []) {

			role.role_id = role.owner_id;
			delete role['owner_id'];

			MetaData.roles.set(role.role_id, role);
		}

		for(const category of metadata.categories || []) {

			category.category_id = category.owner_id;
			delete category['owner_id'];

			MetaData.categories.set(category.category_id, category);
		}

		MetaData.spatialMapThemes =  new Map(metadata.spatialMapThemes ? metadata.spatialMapThemes.map(x => [x.name, JSON.parse(x.theme)]) : []);
		MetaData.filterTypes = new Map(metadata.filterTypes ? metadata.filterTypes.map(x => [x.name.toLowerCase(), x]) : []);
		MetaData.datasources = new Map(metadata.datasources ? metadata.datasources.map(v => [v.slug, v]) : []);
		MetaData.visualizations = new Map(metadata.visualizations ? metadata.visualizations.map(v => [v.slug, v]) : []);
		MetaData.features = new Map(metadata.features ? metadata.features.map(f => [f.feature_id, f]) : []);
		MetaData.globalFilters = new Map(metadata.globalFilters ? metadata.globalFilters.map(d => [d.id, d]) : []);

		user.settings = new Map(metadata.userSettings ? metadata.userSettings.map(us => [us.key, us.value]) : []);

		const features = new Map;

		for(const [key, feature] of MetaData.features || []) {

			if(account.features && account.features.size && (account.features.has(feature.slug) || account.features.has(key))) {
				features.set(feature.slug, feature);
			}
		}

		account.features = features;
	}
}

class ErrorLogs {

	static async send(message, path, line, column, stack) {

		if(ErrorLogs.sending)
			return;

		ErrorLogs.sending = true;

		const
			options = {
			method: 'POST'
			},
			params = {
				message : message,
				description : stack && stack.stack,
				url : path,
				type : 'client',
			};

		try {
			await API.call('errors/log',params, options);
		}
		catch(e) {
			console.log('Failed to log error', e);
			return;
		}

		ErrorLogs.sending = false;
	}
}

class AJAX {

	static async call(url, _parameters, options = {}) {

		AJAXLoader.show();

		const parameters = new URLSearchParams(_parameters);

		if(typeof _parameters == 'object') {
			for(const key in _parameters)
				parameters.set(key, _parameters[key]);
		}

		if(options.method == 'POST') {

			options.body = parameters.toString();

			options.headers = {
				'Content-Type': 'application/x-www-form-urlencoded',
			};
		}

		else if(_parameters)
			url += '?' + parameters.toString();

		let response = null;

		try {
			response = await fetch(url, options);
		}
		catch(e) {
			AJAXLoader.hide();
			throw new API.Exception(e, 'API Execution Failed');
		}

		AJAXLoader.hide();

		if(response.status == 401) {
			const message = (await response.json()).message;
			return User.logout({next: true, redirect: options.redirectOnLogout, message: message});
		}

		if(options.raw) {
			return {
				data: response,
				status: true,
			};
		}

		return response.headers.get('content-type').includes('json') ? await response.json() : await response.text();
	}
}

class API extends AJAX {

	/**
	 * Makes an API call.
	 *
	 * @param  string		endpoint	The endpoint to hit.
	 * @param  parameters	parameters	The api request paramters.
	 * @param  object		options		The options object.
	 * @return Promise					That resolves when the request is completed.
	 */
	static async call(endpoint, parameters = {}, options = {}) {

		if(!endpoint.startsWith('authentication'))
			await API.refreshToken();

		const refresh_token = await Storage.get('refresh_token');

		if(refresh_token) {
			if(typeof parameters == 'string')
				parameters += '&refresh_token='+refresh_token;
			else
				parameters.refresh_token = refresh_token;
		}

		const token = await Storage.get('token');

		if(token && token.body) {

			if(typeof parameters == 'string')
				parameters += '&token='+token.body;

			else
				parameters.token = token.body;
		}

		// If a form id was supplied, then also load the data from that form
		if(options.form)
			API.loadFormData(parameters, options.form);

		endpoint = '/api/v2/' + endpoint;

		const response = await AJAX.call(endpoint, parameters, options);

		if(response && response.status)
			return response.data;

		else
			throw new API.Exception(response);
	}

	/**
	 * This function takes a form id and loads all it's inputs data into the parameters object.
	 *
	 * We use FormData here instead of the a
	 * key/value pair object for two reasons:
	 *
	 * * It lets us pick up all form fields and
	 *	 values automatically without listing them
	 *	 here and worrying about conversions etc.
	 *
	 * * It lets us switch to the more advanced
	 *	 form/multipart Content-Type easily in the
	 *	 future, just comment out the later conversion.
	 *
	 * @param  object	parameters	The parameter list.
	 * @param  string	formData	The FormData object whose elements will be picked.
	 */
	static loadFormData(parameters, formData) {

		if(!(formData instanceof FormData))
			throw new Page.exception('The form object is not an instance of FormData class!');

		for(const key of formData.keys()) {

			let value = formData.get(key).trim();

			if(value && !isNaN(value))
				value = parseFloat(value);

			parameters[key] = value;
		}
	}

	/**
	 * Makes sure the short term token we have is valid and up to date.
	 */
	static async refreshToken() {

		let
			getToken = true,
			token = await Storage.get('token');

		if(token && token.body) {

			try {

				const decodedToken = JSON.parse(atob(token.body.split('.')[1]));

				const user = {
					...JSON.parse(decodeURIComponent(decodedToken.data)),
					iat: decodedToken.iat,
					exp: decodedToken.exp
				};

				// If the token is about to expire in next few seconds then let it refresh.
				// We're using the difference of expiry and creation here to support casses
				// where users manually change system time and local UTC time gets out of sync with remote UTC time.
				if(Date.now() - token.timestamp + 60 * 1000 < (user.exp - user.iat) * 1000)
					getToken = false;

			} catch(e) {}
		}

		if(!(await Storage.has('refresh_token')) || !getToken || !navigator.onLine)
			return;

		const
			parameters = {
				refresh_token: await Storage.get('refresh_token'),
			},
			options = {
				method: 'POST',
				redirectOnLogout: false,
			};

		if(window.account && account.auth_api && Array.isArray(account.settings.get('external_parameters')) && await Storage.get('external_parameters')) {

			const external_parameters = await Storage.get('external_parameters');

			for(const parameter of account.settings.get('external_parameters')) {

				if(parameter.name in external_parameters) {

					parameters['ext_' + parameter.name] = external_parameters[parameter.name] == undefined ? parameter.value : external_parameters[parameter.name];
				}
			}

			parameters.external_parameters = true;
		}

		const response = await API.call('authentication/refresh', parameters, options);

		token = {

			// Save the time we got the token, we can use this later to check if it's about to expire
			timestamp: Date.now(),
			body: response
		};

		await Storage.set('token', token);

		Page.load();
	}
}

API.Exception = class {

	constructor(response = {}) {

		this.status = response.status || '';
		this.message = response.message || '';
		this.body = response;
	}
}

class AJAXLoader {

	static setup() {

		this.animateEllipses();

		setInterval(() => this.animateEllipses(), 500);
	}

	/**
	 * Show the working flag.
	 */
	static show() {

		if(typeof document == 'undefined')
			return;

		if(!AJAXLoader.count)
			AJAXLoader.count = 0;

		AJAXLoader.count++;

		const container = document.getElementById('ajax-working');

		// Because the container may not always be available
		if(!container)
			return;

		container.classList.add('show');
		container.classList.remove('hidden');

		clearTimeout(AJAXLoader.timeout);
		clearTimeout(AJAXLoader.timeoutHidden);
	}

	/**
	 * Hide the flag.
	 */
	static hide() {

		if(typeof document == 'undefined')
			return;

		AJAXLoader.count--;

		const container = document.getElementById('ajax-working');

		// Because the container may not always be available or some other request me still be in progress.
		if(!container || AJAXLoader.count)
			return;

		AJAXLoader.timeout = setTimeout(() => {

			container.classList.remove('show');

			AJAXLoader.timeoutHidden = setTimeout(() => container.classList.add('hidden'), 300);
		}, 100);
	}

	static animateEllipses() {

		const container = document.getElementById('ajax-working');

		// Because the container may not always be available or some other request me still be in progress.
		if(!container || AJAXLoader.count)
			return;

		this.ellipsesDots = this.ellipsesDots < 3 ? this.ellipsesDots + 1 : 0;

		container.textContent = 'Working' + (new Array(this.ellipsesDots).fill('.').join(''));
	}
}

class Format {

	static ago(timestamp) {

		if(!timestamp)
			return '';

		const
			currentSeconds = typeof timestamp == 'number' ? timestamp : Date.parse(timestamp),
			agoFormat = [
				{
					unit: 60,
					minimum: 5,
					name: 'second',
				},
				{
					unit: 60,
					minimum: 1,
					name: 'minute',
				},
				{
					unit: 24,
					minimum: 1,
					name: 'hour',
					prefix: 'An',
				},
				{
					unit: 7,
					minimum: 1,
					name: 'day',
				},
				{
					unit: 4.3,
					minimum: 1,
					name: 'week',
				},
				{
					unit: 12,
					minimum: 1,
					name: 'month',
				},
				{
					name: 'year',
				},
			];

		//If the time is future.
		if(currentSeconds > Date.now())
			return '';

		//If the date is invalid;
		if(!currentSeconds)
			return 'Invalid Date';

		let
			time = Math.floor((Date.now() - currentSeconds) / 1000),
			finalString = '',
			format = agoFormat[0];

		for(const data of agoFormat) {

			//If the time format is year then break.
			if(agoFormat.indexOf(data) >= agoFormat.length - 1)
				break;

			format = data;

			format.time = time;

			time = Math.floor(time / format.unit);

			if(!time)
				break;
		}

		//Special case for year.
		const years = time % 12;

		if(years) {

			finalString = years == 1 ? 'A year ago' : Format.dateTime(timestamp);
		}
		else
			finalString = calculateAgo(format);


		function calculateAgo(format) {

			const
				range = format.unit - (0.15 * format.unit),
				time = format.time % format.unit,
				index = agoFormat.indexOf(format);

			let string = `${time} ${format.name}s ago`;

			if(time <= format.minimum)
				string = format.name.includes('second') ? 'Just Now' : `${format.prefix || 'A'} ${format.name} ago`;
			else if(time >= range) {

				let
					nextFormat = agoFormat[index + 1],
					prefix = nextFormat.prefix || 'a';

				string = `About ${prefix.toLowerCase()} ${nextFormat.name} ago`;
			}

			return string;
		}

		return finalString;
	}

	static date(date) {

		const options = {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC',
		};

		if(!Format.date.formatter)
			Format.date.formatter = new Intl.DateTimeFormat(page.urlSearchParameters.get('locale') || undefined, options);

		if(typeof date == 'string')
			date = Date.parse(date);

		if(typeof date == 'object' && date)
			date = date.getTime();

		if(!date)
			return '';

		return Format.date.formatter.format(date);
	}

	static month(month) {

		const options = {
			year: 'numeric',
			month: 'short',
			timeZone: 'UTC',
		};

		if(!Format.month.formatter)
			Format.month.formatter = new Intl.DateTimeFormat(page.urlSearchParameters.get('locale') || undefined, options);

		if(typeof month == 'string')
			month = Date.parse(month);

		if(typeof month == 'object' && month)
			month = month.getTime();

		if(!month)
			return '';

		return Format.month.formatter.format(month);
	}

	static year(year) {

		const options = {
			year: 'numeric',
			timeZone: 'UTC',
		};

		if(!Format.year.formatter)
			Format.year.formatter = new Intl.DateTimeFormat(page.urlSearchParameters.get('locale') || undefined, options);

		if(typeof year == 'string')
			year = Date.parse(year);

		if(typeof year == 'object' && year)
			year = year.getTime();

		if(!year)
			return '';

		return Format.year.formatter.format(year);
	}

	static time(time) {

		const options = {
			hour: 'numeric',
			minute: 'numeric'
		};

		if(!Format.time.formatter)
			Format.time.formatter = new Intl.DateTimeFormat(page.urlSearchParameters.get('locale') || undefined, options);

		if(typeof time == 'string')
			time = Date.parse(time);

		if(typeof time == 'object' && time)
			time = time.getTime();

		if(!time)
			return '';

		return Format.time.formatter.format(time);
	}

	static customTime(time, format) {

		if(!Format.cachedFormat)
			Format.cachedFormat = [];

		let selectedFormat;

		for(const data of Format.cachedFormat) {

			if(JSON.stringify(data.format) == JSON.stringify(format))
				selectedFormat = data;
		}

		if(!selectedFormat) {

			selectedFormat = {
				format: format,
				formatter: new Intl.DateTimeFormat(page.urlSearchParameters.get('locale') || undefined, format),
			};

			Format.cachedFormat.push(selectedFormat);
		}

		Format.customTime.formatter = selectedFormat.formatter;

		if(time && typeof time == 'string')
			time = Date.parse(time);

		if(time && typeof time == 'object')
			time = time.getTime();

		if(!time)
			return '';

		return Format.customTime.formatter.format(time);
	}

	static dateTime(dateTime) {

		const options = {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric'
		};

		if(!Format.dateTime.formatter)
			Format.dateTime.formatter = new Intl.DateTimeFormat(page.urlSearchParameters.get('locale') || undefined, options);

		if(typeof dateTime == 'string')
			dateTime = Date.parse(dateTime);

		if(typeof dateTime == 'object' && dateTime)
			dateTime = dateTime.getTime();

		if(!dateTime)
			return '';

		return Format.dateTime.formatter.format(dateTime);
	}

	/**
	 * Static number is used for formatting numbers according to javascript Intl.NumberFormat
	 * It accepts two parameters i.e number and format, number is mandatory and formal is optional.
	 * If no format is passed then by default it is set as format = {maximumFractionDigits: 2}
	 *
	 * This will do things like
	 * - Rounding off digits using toFixed, ceil and floor.
	 * - Setting up currency for the number
	 * - Limiting number of integer, fractional, significant digits.
	 *
	 * @param  number	number	A mandatory value, The number on which selected format will be applied
	 * @param  object	format	An optional value, format passed into the function as an object that contains
	 * 							paramters required for formatting the number.
	 */
	static number(number, format = {maximumFractionDigits: 2}) {

		if(!Format.cachedNumberFormat)
			Format.cachedNumberFormat = new Map();

		const cacheKey = JSON.stringify(format);

		if(!Format.cachedNumberFormat.has(cacheKey)) {

			try {
				Format.cachedNumberFormat.set(cacheKey, new Intl.NumberFormat(format.locale, format));
			}
			catch(e) {
				Format.cachedNumberFormat.set(cacheKey, new Intl.NumberFormat());
			}
		}

		if(!format.roundOff)
			return Format.cachedNumberFormat.get(cacheKey).format(number);

		let result;

		{
			const formatWhiteList = JSON.parse(JSON.stringify(format));

			for(const format in formatWhiteList) {

				if(!format.endsWith('Digits'))
					delete formatWhiteList[format];
			}

			formatWhiteList.useGrouping = false;

			result = parseFloat(Format.number(number, formatWhiteList));
		}

		{
			if(format.roundOff == 'round')
				result = result.toFixed(format.roundPrecision || 0);

			else if(['ceil', 'floor'].includes(format.roundOff))
				result = Math[format.roundOff](result);
		}

		{
			const formatBlacklist = JSON.parse(JSON.stringify(format));

			delete formatBlacklist.roundOff

			return Format.number(result, formatBlacklist);
		}
	}
}

class Sections {

	static async show(id) {

		for(const section of document.querySelectorAll('main section.section'))
			section.classList.remove('show');

		const container = document.querySelector(`main section.section#${id}`);

		if(container)
			container.classList.add('show');
	}
}

/**
 * A generic code editor UI.
 *
 * Useage:
 *
 * 	const editor = new CodeEditor();
 *
 * 	container.appendChild(editor.contaier);
 *
 * 	editor.value = 'foo';
 *
 * 	// foo
 *	console.log(editor.value);
 */
class CodeEditor {

	/**
	 * @param mode	string	Defines the color and formating scheme for the code. For example sql, js, HTML.
	 *
	 * @return CodeEditor
	 */
	constructor({mode = null} = {}) {

		if(!window.ace)
			throw new Page.exception('Ace editor not available!');

		this.mode = mode;
	}

	/**
	 * @return HTMLElement	A reference for the editor's contaier. Will be used to append it in UI.
	 */
	get container() {

		const container = this.editor.container;

		container.classList.add('code-editor');

		return container;
	}

	/**
	 * @return Creates a new Ace Editor instance if not already created and returns it.
	 */
	get editor() {

		if(this.instance)
			return this.instance;

		const editor = this.instance = ace.edit(document.createElement('div'));

		editor.setTheme('ace/theme/monokai');

		editor.setFontSize(16);
		editor.$blockScrolling = Infinity;

		if(this.mode)
			editor.getSession().setMode(`ace/mode/${this.mode}`);

		return editor;
	}

	/**
	 * @return	Get	The current value from the editor.
	 */
	get value() {
		return this.editor.getValue();
	}

	/**
	 * @param string	value	Set a new value for the editor.
	 */
	set value(value) {
		this.editor.setValue(value || '', 1);
	}

	/**
	 * Set a list of autocomplete suggestions for the editor.
	 *
	 * @param Array	list	A list of autocomplete values to pass into the editor.
	 *
	 * Format:
	 * [
	 * 	{
	 * 		name: "Foo",
	 * 		value: "foo",
	 * 		meta: "bar"
	 * 	},
	 * 	[...]
	 * ]
	 */
	setAutoComplete(list) {

		this.langTools = ace.require('ace/ext/language_tools');

		this.langTools.setCompleters([{
			getCompletions: (_, __, ___, ____, callback) => callback(null, list),
		}]);

		this.editor.setOptions({
			enableBasicAutocompletion: true,
		});
	}

	/**
	 * Assign a callback for an event on the editor.
	 *
	 * @param string	event		The event that the client wants to listen to (only 'change' is supported for now)
	 * @param Function	callback	The callback function to call when the passed event happens.
	 */
	on(event, callback) {

		if(event != 'change')
			return;

		this.editor.getSession().on('change', () => callback());
	}
}

/**
 * A generic WYSIWYG editor for letting the user generate HTML to show in the panel.
 *
 * Useage:
 *
 * const editor = new HTMLEditor();
 *
 * container.appendChild(editor.container);
 *
 * // Need to call setup after adding the container to DOM, doesn't currently work entirely outside of DOM.
 * editor.setup();
 *
 * editor.value = 'test';
 *
 * // test
 * console.log(editor.value);
 */
class HTMLEditor {

	constructor({height = 400} = {}) {

		if(!window.tinymce)
			throw new Page.exception('TinyMCE HTML Editor not available!');

		this.height = height;

		// Used to uniquely identify the editor later
		this.id = Math.floor(Math.random() * 100000);

		this.visualEditor = true;
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');

		container.classList.add('html-editor');

		container.innerHTML = `
			<span class="editor-toggle">
				<button type="button" class="code-toggle hidden"><i class="fas fa-code"></i> <span>Code Editor</span></button>
				<button type="button" class="wysiwyg-toggle hidden"><i class="fas fa-paint-brush"></i> <span>Visual Editor</span></button>
			</span>
			<div class="wysiwyg"><div id="code-editor-${this.id}"></div></div>
		`;

		container.querySelector('.code-toggle').on('click', () => {

			this.visualEditor = !this.visualEditor;

			this.render();
		});

		container.querySelector('.wysiwyg-toggle').on('click', () => {

			this.visualEditor = !this.visualEditor;

			this.render();
		});

		return container;
	}

	/**
	 * Update editor UI and sync data between visual and code editor components.
	 */
	render() {

		this.container.querySelector('.wysiwyg').classList.toggle('hidden', !this.visualEditor);
		this.container.querySelector('.wysiwyg-toggle').classList.toggle('hidden', this.visualEditor);

		this.container.querySelector('.code-editor').classList.toggle('hidden', this.visualEditor);
		this.container.querySelector('.code-toggle').classList.toggle('hidden', !this.visualEditor);

		if(this.visualEditor)
			this.editor.setContent(this.codeEditor.value);
		else
			this.codeEditor.value = this.editor.getContent();
	}

	/**
	 * Creates a new editor instance if not already created.
	 * Doesn't currently work unless the container exists in DOM.
	 */
	async setup() {

		if(this.editor)
			return;

		this.codeEditor = new CodeEditor({mode: 'html'});

		this.container.appendChild(this.codeEditor.container);

		this.codeEditor.container.classList.add('hidden');
		this.codeEditor.container.style.height = this.height + 'px';

		this.on('change', () => this.codeEditor.value = this.value);

		[this.editor] = await tinymce.init({
			selector: '#code-editor-' + this.id,
			height: this.height,
			plugins: [
				'advlist autolink lists link image charmap print preview anchor',
				'searchreplace visualblocks code fullscreen emoticons',
				'insertdatetime media table paste help wordcount'
			],
			toolbar: 'undo redo |  formatselect | bold italic backcolor forecolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent emoticons | removeformat print | help',
			content_css: [
				'//www.tinymce.com/css/codepen.min.css',
				'/css/main.css',
				`/css/themes/${account.settings.get('theme') == 'dark' ? 'dark' : 'light'}.css`,
			]
		});

		this.render();
	}

	/**
	 * @return string	Fetch the editor's value in HTML form.
	 */
	get value() {

		if(this.visualEditor && this.editor)
			return this.editor.getContent();

		return this.codeEditor.value;
	}

	/**
	 * @param string	value	The value for the editor that will be set.
	 */
	set value(value = '') {

		if(!value)
			value = '';

		this.codeEditor.value = value;
		this.editor.setContent(value);

		return true;
	}

	on(event, callback) {

		if(!this.editor)
			return;

		this.editor.on(event, callback);
	}
}

/**
 * A generic implementation for a modal box.
 *
 * It has the following features.
 *
 * - Lets users set the heading, body content and footer of the dialog.
 * - Provides a clean interface with user controlled show and hide features.
 */
class DialogBox {

	constructor({closable = true} = {}) {

		this.closable = closable;
	}

	/**
	 * The main container of the Dialog Box.
	 *
	 * @return	HTMLElement	A div that has the entire content.
	 */
	get container() {

		// Make sure we have a container to append the dialog box in
		if(!DialogBox.container)
			throw new Page.exception('Dialog Box container not defined before use!');

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');
		container.classList.add('dialog-box-blanket');

		container.innerHTML = `
			<section class="dialog-box">
				<header><h3></h3></header>
				<div class="body"></div>
			</section>
		`;

		if(this.closable) {

			container.querySelector('header').insertAdjacentHTML(
				'beforeend',
				'<span class="close"><i class="fa fa-times"></i></span>'
			);

			container.querySelector('.dialog-box header span.close').on('click', () => this.hide());

			container.on('click', () => this.hide());
		}

		container.querySelector('.dialog-box').on('click', e => e.stopPropagation());

		this.hide();

		DialogBox.container.appendChild(container);

		return container;
	}

	/**
	 * Update the heading of the dialog box
	 *
	 * @param	dialogHeading	The new heading
	 */
	set heading(dialogHeading) {

		const heading = this.container.querySelector('.dialog-box header h3');

		if(dialogHeading instanceof HTMLElement) {

			heading.textContent = null;
			heading.appendChild(dialogHeading);
		}

		else if(typeof dialogHeading == 'string')
			heading.innerHTML = dialogHeading;

		else
			throw Page.exception('Invalid heading format');
	}

	/**
	 *
	 * @return HTMLElement	reference to the dialog box body container to set the content of the dialog box.
	 */
	get body() {

		return this.container.querySelector('.dialog-box .body');
	}

	/**
	 * Hides the dialog box container
	 */
	hide() {

		document.querySelector('main').classList.remove('blur');
		document.querySelector('header').classList.remove('blur');
		NotificationBar.container.classList.remove('blur');

		this.container.classList.add('hidden');

		if(this.closeCallback) {

			this.closeCallback();
		}
	}

	/**
	 * Displays the dialog box container
	 */
	show() {

		if(this.closable) {

			document.body.removeEventListener('keyup', this.keyUpListener);

			document.body.on('keyup', this.keyUpListener = e => {

				if(e.keyCode == 27)
					this.hide();
			});
		}

		document.querySelector('main').classList.add('blur');
		document.querySelector('header').classList.add('blur');
		NotificationBar.container.classList.add('blur');

		this.container.classList.remove('hidden');
	}

	/**
	 * Returns the current state of the dialog box (open / closed)
	 */
	get status() {
		return !this.container.classList.contains('hidden');
	}

	on(event, callback) {

		if(event != 'close')
			throw new Page.exception('Only Close event is supported...');

		this.closeCallback = callback;
	}
}

/**
 * A generic implementation for a multiple select dropdown.
 *
 * It has the following features.
 *
 * - Takes a list of possible values in a specific format [{name, value}]
 * - Lets users select one or multiple of these values.
 * - Provides a clean interface with a value getter and setter.
 * - The input can be disabled as well.
 */
class MultiSelect {

	/**
	 * Create a new instance for the MultiSelect.
	 *
	 * @param  Array	options.datalist			The set of possible values for the MultiSelect.
	 * @param  Boolean	options.multiple			Toggle for allowing the user to select multiple values.
	 * @param  Boolean	options.expand				Wether the dropdown should float and show when needed or if it should take it's own place and always be visible.
	 * @param  String	options.dropDownPosition	The position for the dropdown, can be 'top' or 'bottom'.
	 * @return MultiSelect							The object reference for MultiSelect
	 */
	constructor({datalist = [], multiple = true, dropDownPosition = 'bottom', mode = 'collapse', name = ''} = {}) {

		this.datalist = datalist;
		this.multiple = multiple;
		this.dropDownPosition = ['top', 'bottom'].includes(dropDownPosition) ? dropDownPosition : 'bottom';

		this.selectedValues = new Set();
		this.inputName = 'multiselect-' + Math.floor(Math.random() * 10000);
		this.name = name || '';

		if(['collapse', 'stretch'].includes(mode)) {

			this.mode = mode;
		}
		else {

			throw new Page.exception('Invalid multiselect mode');
		}

		this.callbacks = new Set;
	}

	/**
	 * The main container of the MultiSelect.
	 *
	 * @return HTMLElement	A div that has the entire content.
	 */
	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');

		container.classList.add('multi-select');

		container.innerHTML = `
			<input type="search" placeholder="Search...">
		`;

		const search = container.querySelector('input[type=search]');

		if(this.mode == 'stretch') {

			container.appendChild(this.options);
			container.classList.add('stretched');
		}

		container.classList.add(this.dropDownPosition);

		this.render();

		search.on('click', e => {

			e.stopPropagation();

			if(!this.optionsContainer) {

				container.appendChild(this.options);
				this.render();
			}

			if(!container.classList.contains('stretched')) {

				for(const option of document.querySelectorAll('.multi-select .options')) {

					if(!option.parentElement.classList.contains('stretched')) {

						option.classList.add('hidden');
					}
				}
			}

			this.options.classList.remove('hidden');
			this.container.querySelector('input[type=search]').placeholder = 'Search...';
		});

		search.on('dblclick', () => {

			if(this.mode != 'stretch' && this.optionsContainer) {

				this.options.classList.add('hidden');
			}

			this.setPlaceholderText();
		});

		search.on('keyup', () => this.recalculate());

		document.body.on('click', () => {

			search.value = '';
			this.setPlaceholderText();

			if(!this.optionsContainer) {

				return;
			}

			this.options.classList.toggle('hidden', this.mode != 'stretch');
			this.options.querySelector('.modes-drop-down').classList.add('hidden');
		});

		return container;
	}

	get datalist() {

		return this.datalistMap ? [...this.datalistMap.values()] : [];
	}

	set datalist(datalist) {

		if(Array.isArray(datalist)) {

			this.datalistMap = new Map(datalist.map(x => [x.value.toString(), x]));
		}
		else if (datalist instanceof Map) {

			this.datalistMap = datalist;
		}
		else {

			throw new Error('Datalist must be an array or map' );
		}
	}

	dualMode() {

		if(this.disabled) {

			return;
		}

		this.mode = this.mode == 'stretch' ? 'collapse' : 'stretch';

		this.options.querySelector('.dual').textContent = this.mode == 'stretch' ? 'Collapse' : 'Stretch';
		this.options.querySelector('.mode').textContent = this.mode == 'stretch' ? 'Stretch' : 'Collapse';
		this.container.classList.toggle('stretched', this.mode == 'stretch');
		this.options.classList.toggle('hidden', this.mode == 'collapse');
	}

	expand() {

		if(this.disabled || !this.datalistMap) {

			return;
		}

		if(this.expandDialog) {

			this.setDialogButtonInnerText();
			return this.expandDialog.show();
		}

		this.expandDialog = new DialogBox();

		this.expandDialog.heading = this.name;

		const dialogBody = document.createElement('div');
		dialogBody.classList.add('multi-select-expanded');

		dialogBody.innerHTML = `
			<header>
				<button type="button" class="operation"></button>
			</header>
			<div class="list"></div>
			<div class="no-matches NA hidden">No data found</div>
		`;

		const header = dialogBody.querySelector('header');

		this.dialogSearch= new SearchColumnFilters({
			data: [...this.datalistMap.values()],
			filters: [
				{
					key: 'Name',
					rowValue: row => [row.name],
				},
				{
					key: 'Value',
					rowValue: row => [row.value],
				},
				{
					key: 'Subtitle',
					rowValue: row => row.subtitle ? [row.subtitle] : [],
				},
			],
			advancedSearch: true
		});

		header.appendChild(this.dialogSearch.container);
		header.appendChild(this.dialogSearch.globalSearch.container);

		const operation = header.querySelector('.operation');

		operation.on('click', () => {

			if(!this.selectedValues.size && this.multiple) {

				operation.innerHTML = '<i class="fas fa-check-square"></i> All';
				this.all();
			}
			else {

				operation.innerHTML = '<i class="far fa-square"></i> Clear';
				this.clear();
			}
		});

		this.loadList(dialogBody.querySelector('.list'));

		this.expandDialog.body.appendChild(dialogBody);
		this.setDialogButtonInnerText();

		this.dialogSearch.on('change', () => {

			const filterDataMap = new Map(this.dialogSearch.filterData.map(x => [x.value, x]));

			this.loadList(dialogBody.querySelector('.list'), filterDataMap);
			dialogBody.querySelector('.no-matches').classList.toggle('hidden', this.dialogSearch.filterData.length);
		});

		this.expandDialog.show();

	}

	/**
	 * Update the value of a MultiSelect.
	 * This will also take care of updating the UI and fire any change callbacks if needed.
	 *
	 * @param  Array	values	The array of new values that must match the datalist.
	 */
	set value(values = []) {

		if(!(this.datalistMap && this.datalistMap.size)) {

			return;
		}

		this.selectedValues.clear();

		if(!Array.isArray(values))
			values = [values];

		for(const value of values) {

			if(!value || !this.datalistMap.has(value.toString())) {

				continue;
			}

			this.selectedValues.add(value.toString());

			if (!this.multiple) {

				break;
			}
		}

		this.recalculate();
	}

	/**
	 * Get the current value of the MultiSelect.
	 *
	 * @return Array	An array of 'value' properties of the datalist.
	 */
	get value() {

		return Array.from(this.selectedValues);
	}

	/**
	 * Change the disabled state of the MultiSelect.
	 *
	 * @param  boolean value The new state of the disabled property.
	 */
	set disabled(value) {

		this._disabled = value;
		this.render();
	}

	/**
	 * Get the disabled status of the MultiSelect.
	 */
	get disabled() {

		return this._disabled;
	}

	get options() {

		if(this.optionsContainer) {

			return this.optionsContainer;
		}

		const options = this.optionsContainer = document.createElement('div');
		options.classList.add('options');

		options.innerHTML = `
			<header>
					<a class="all">All</a>
					<a class="clear">Clear</a>
					<a class="mode">${this.mode == 'stretch' ? 'Stretch' : 'Collapse'}</a>
				</header>
				<div class="list"></div>
				<div class="no-matches NA hidden">No data found</div>
				<footer class="hidden"></footer>
				<div class="modes-drop-down hidden">
					<span class="dual">${this.mode == 'stretch' ? 'Collapse' : 'Stretch'}</span>
					<span class="expand">Expand</span>
				</div>
		`;

		options.on('click', e => e.stopPropagation());
		options.querySelector('header').on('click', e => e.preventDefault());
		options.querySelector('.modes-drop-down').on('click', e => e.preventDefault());

		options.querySelector('header .all').on('click', () => this.all());
		options.querySelector('header .clear').on('click', () => this.clear());

		options.querySelector('header .mode').addEventListener('click', () => options.querySelector('.modes-drop-down').classList.toggle('hidden'));

		options.querySelector('.modes-drop-down .dual').on('click', () => {

			this.dualMode();
			options.querySelector('.modes-drop-down').classList.add('hidden');
		});

		options.querySelector('.modes-drop-down .expand').on('click', () => {

			this.expand();
			options.querySelector('.modes-drop-down').classList.add('hidden');
		});

		return options;
	}

	/**
	 * Render the datalist to the MultiSelect.
	 * Call this externally if you have just updated the datalist after object construction.
	 */
	render() {

		this.container.querySelector('input[type=search]').disabled = this.disabled || false;

		if(!this.optionsContainer || !this.datalistMap || !this.datalistMap.size) {

			return this.recalculate();
		}

		this.options.querySelector('header .all').classList.toggle('hidden', !this.multiple);

		const optionList = this.options.querySelector('.list');

		optionList.textContent = null;

		this.expandDialog = null;

		this.loadList(this.options.querySelector('.list'));
	}

	loadList(list, data = this.datalistMap) {

		list.textContent = null;

		for(const row of data.values()) {

			const
				label = document.createElement('label'),
				input = document.createElement('input'),
				text = document.createElement('div');

			text.classList.add('option-name');
			text.innerHTML = `<span>${row.name}</span>`;

			if(row.subtitle && row.subtitle != '') {

				const subtitle = document.createElement('span');
				subtitle.classList.add('subtitle');

				subtitle.innerHTML = row.subtitle;
				text.appendChild(subtitle);
			}

			input.name = this.inputName;
			input.value = row.value == null ? '' : row.value;
			input.type = this.multiple ? 'checkbox' : 'radio';

			label.appendChild(input);
			label.appendChild(text);

			label.setAttribute('title', row.value);

			input.on('change', () => {

				if(!this.multiple) {

					this.selectedValues.clear();
					this.selectedValues.add(input.value.toString());
				}
				else {

					input.checked ? this.selectedValues.add(input.value.toString()) : this.selectedValues.delete(input.value.toString());
				}

				this.setDialogButtonInnerText();

				this.recalculate();
			});

			if(this.expandDialog) {

				row.dialogInput = input;
			}
			else {

				row.input = input;
			}

			if(this.disabled)
				input.disabled = true;

			label.on('dblclick', e => {

				e.stopPropagation();

				this.clear();
				label.click();
			});

			list.appendChild(label);
		}

		this.recalculate();
	}

	setPlaceholderText() {

		const search = this.container.querySelector('input[type=search]');

		if(!this.selectedValues.size) {

			return search.placeholder = 'Search...';
		}

		const first =  this.datalistMap.get(this.selectedValues.values().next().value);
		search.placeholder = first ? this.selectedValues.size > 1 ? `${first.name} and ${this.selectedValues.size - 1} more` : first.name : 'Search...';

	}

	/**
	 * Recalculate shown items from the datalist based on any value in search box and their summary numbers in the footer.
	 */
	recalculate() {

		if(!this.containerElement) {

			return;
		}

		const search = this.container.querySelector('input[type=search]');

		if(!this.optionsContainer) {

			return this.setPlaceholderText();
		}

		for(const row of this.datalistMap.values()) {

			row.input.checked = this.selectedValues.has(row.input.value);

			if(this.expandDialog) {

				row.dialogInput.checked = this.selectedValues.has(row.dialogInput.value);
				row.dialogInput.parentElement.classList.toggle('selected', row.dialogInput.checked);
			}

			row.hide = false;

			let name = row.name;

			if(!name)
				name = '';

			name = name.toString();

			const rowValue = name.concat(' ', row.value, ' ', row.subtitle || '');

			if(search.value && !rowValue.toLowerCase().trim().includes(search.value.toLowerCase().trim()))
				row.hide = true;

			row.input.parentElement.classList.toggle('hidden', row.hide);
			row.input.parentElement.classList.toggle('selected', row.input.checked);
		}

		const
			total = this.options.querySelectorAll('.list label').length,
			hidden = this.options.querySelectorAll('.list label.hidden').length,
			selected = this.options.querySelectorAll('.list input:checked').length,
			firstSelected = this.options.querySelector('.list label.selected div > span');

		search.placeholder = 'Search...';

		if(firstSelected)
			search.placeholder = selected > 1 ? `${firstSelected.textContent} and ${selected - 1} more` : firstSelected.textContent;

		const footer = this.options.querySelector('footer');

		footer.classList.remove('hidden');
		footer.innerHTML = `
			<span>Total: <strong>${total}</strong></span>
			<span>Showing: <strong>${total - hidden}</strong></span>
			<span>Selected: <strong>${selected}</strong></span>
		`;

		this.options.querySelector('.no-matches').classList.toggle('hidden', total != hidden);

		this.fireCallback('change');
	}

	/**
	 * Assign a callback to the MultiSelect.
	 *
	 * @param  string	event		The type of event. Only 'change' supported for now.
	 * @param  Function	callback	The callback to call when the selected value in the multiselect changes.
	 */
	on(event, callback) {

		this.callbacks.add({event, callback});
	}

	fireCallback(event) {

		for(const callback of this.callbacks) {

			if(callback.event == event)
				callback.callback();
		}
	}

	/**
	 * Select all inputs of the MultiSelect, if applicable.
	 * May not be applicable if multiple is set to false.
	 */
	all() {

		if(!this.multiple || this.disabled || !this.datalistMap)
			return;

		for(const data of this.datalistMap.values()) {

			if(data.value != null && !data.hide)
				this.selectedValues.add(data.value.toString())
		}

		this.recalculate();
	}

	/**
	 * Clear the MultiSelect.
	 */
	clear() {

		if(this.disabled)
			return;

		this.selectedValues.clear();

		this.recalculate();
	}

	setDialogButtonInnerText() {

		if(!this.expandDialog) {

			return;
		}

		this.expandDialog.container.querySelector('header .operation').innerHTML = this.multiple && this.selectedValues.size == this.datalistMap.size ?
			'<i class="fas fa-check-square"></i> All' :  this.selectedValues.size ? '<i class="far fa-minus-square"></i>' : '<i class="far fa-square"></i> Clear';
	}
}

class ObjectRoles {

	constructor(owner, owner_id, allowedTargets = [], allowMultiple = true) {

		this.targets = {
			user: {
				API: 'users/list',
				name_fields: ['first_name', 'middle_name', 'last_name'],
				value_field: 'user_id',
				subtitle: 'email',
				data: [],
				ignore_categories: true,
				actual_target: 'user',
				multiple: false,
			},

			role: {
				API: 'category/list',
				name_fields: ['name'],
				value_field: 'category_id',
				data: [],
				actual_target: 'category',
				multiple: true,
				is_category: true,
				target_field: 'category_id',
				editable: true,
			},
		};

		if (!allowMultiple) {

			for (const target in this.targets) {

				this.targets[target].multiple = false;
				this.targets[target].editable = false;
			}
		}

		this.owner = owner;
		this.ownerId = owner_id;
		this.allowedTargets = new Set(allowedTargets.length ? allowedTargets.filter(x => x in this.targets) : Object.keys(this.targets));

		if (!user.privileges.has('user.list')) {

			this.allowedTargets.delete('user')
		}

		if (!(user.privileges.has('user.list') || user.privileges.has('visualization.list') || user.privileges.has('report.insert') || user.privileges.has('report.update'))) {

			this.allowedTargets.delete('role')
		}

		this.alreadyVisible = [];
		this.allowedTargets = [...this.allowedTargets];

		this.sortTable = new SortTable();
	}

	async load() {

		this.data = [];

		const [role] = [...MetaData.roles.values()].filter(x => x.role_id);

		this.role = role.role_id;

		const listRequestParams = new URLSearchParams();

		listRequestParams.append('owner', this.owner);
		listRequestParams.append('owner_id', this.ownerId);

		for (const target of this.allowedTargets) {

			listRequestParams.append('target[]', target);
		}

		const objectRoles = await API.call('object_roles/list', listRequestParams.toString());

		this.alreadyVisible = [];

		for (const row of objectRoles) {

			for (const categoryId of row.category_id) {

				const newRow = {};

				Object.assign(newRow, row);

				newRow.category_id = categoryId;

				this.alreadyVisible.push(newRow);
			}
		}

		for (const target of this.allowedTargets) {

			const data = await API.call(this.targets[target].API);

			this.targets[target].data = [];

			for (const row of data) {

				this.targets[target].data.push({
					name: this.targets[target].name_fields.map(x => row[x]).filter(x => x).join(' '),
					value: row[this.targets[target].value_field || 'id'],
					subtitle: row[this.targets[target].subtitle],
				});
			}
		}

		for (const target in this.targets) {

			this.targets[target].multiSelect = new MultiSelect({
				datalist: this.targets[target].data,
				multiple: this.targets[target].multiple,
				dropDownPosition: 'top',
			});
		}

		this.combine();
		this.container;
		this.shareButton;
	}

	render() {

		if (!this.getContainer)
			this.container;

		const table = this.getContainer.querySelector('.object-roles > table');
		table.innerHTML = null;
		table.appendChild(this.table);
		this.multiSelect.render();
	}

	get container() {

		if (this.getContainer)
			return this.getContainer;

		const container = document.createElement('div');

		if (!this.allowedTargets.length) {

			container.classList.add('hidden');
			return;
		}

		container.classList.add('object-roles');

		container.appendChild(this.table);
		container.appendChild(this.form);

		this.getContainer = container;

		return container;
	}

	get form() {

		if (this.submitForm)
			return this.submitForm;

		const form = document.createElement('form');

		const submitButton = document.createElement('button');
		submitButton.type = 'submit';
		submitButton.innerHTML = `<i class="fa fa-paper-plane"></i> Share`;

		this.targetSelectDropdown = this.selectDropDown(this.allowedTargets.map(target => {

			return {
				value: target,
				text: target.charAt(0).toUpperCase() + target.slice(1),
			}
		}));

		this.multiSelect = this.targets[this.targetSelectDropdown.value].multiSelect;

		this.targetSelectDropdown.addEventListener('change', (e) => {

			this.multiSelect.container.remove();

			this.multiSelect = this.targets[e.target.value].multiSelect;
			form.insertBefore(this.multiSelect.container, submitButton);

		});

		form.appendChild(this.targetSelectDropdown);
		form.appendChild(this.multiSelect.container);
		form.appendChild(submitButton);
		form.addEventListener('submit', (e) => this.insert(e));

		this.submitForm = form;

		return form
	}

	selectDropDown(pairedData) {

		this.selectedType = document.createElement('select');

		for (const target of pairedData) {

			const option = document.createElement('option');
			option.value = target.value;
			option.text = target.text;
			this.selectedType.appendChild(option);
		}

		return this.selectedType;
	}

	get shareButton() {

		if (this.button) {

			return this.button;
		}

		const container = document.createElement('div');
		container.classList.add('object-roles');

		const button = document.createElement('button');
		button.classList.add('share-button');
		button.textContent = `Share ${this.owner}`;

		container.appendChild(button);
		this.button = container;


		button.addEventListener('click', () => {

			const heading = this.allowedTargets.length === 1 ?
				this.allowedTargets[0] :
				`${this.allowedTargets.slice(0, -1).join(', ')} or ${this.allowedTargets[this.allowedTargets.length - 1]}.`;

			const dialougeBox = new DialogBox();
			dialougeBox.heading = `Share this ${this.owner} with any ${heading}`;
			dialougeBox.body.appendChild(this.container);
			dialougeBox.show();
		});

		return this.button;
	}

	get table() {

		const table = document.createElement('table');

		table.innerHTML = `
			<thead>
				<tr>
					<th>Shared With</th>
					<th>Name</th>
					<th class="action">Save</th>
					<th class="action">Delete</th>
				</tr>
			</thead>
			<tbody></tbody>
		`;

		const tbody = table.querySelector('tbody');

		for (const row of this.alreadyVisible) {

			const tr = document.createElement('tr');

			tr.innerHTML = `
				<td>${row.target.charAt(0).toUpperCase() + row.target.slice(1)}</td>
				<td id="targetMultiSelect"></td>
				<td title="Save" class="action ${this.targets[row.target].editable ? 'green' : 'grey'}"><i class="far fa-save"></i></td>
				<td title="Delete" class="action red"><i class="far fa-trash-alt"></i></td>
			`;

			if (this.targets[row.target].multiple) {

				const targetMultiSelect = new MultiSelect({
					datalist: this.targets[row.target].data.map(x => {
						return {
							name: x.name,
							value: x.value
						}
					}),
					multiple: this.targets[row.target].multiple,
				});

				targetMultiSelect.value = row.category_id;

				tr.querySelector('#targetMultiSelect').appendChild(targetMultiSelect.container);

				row.multiSelect = targetMultiSelect;
			}

			else {

				tr.querySelector('#targetMultiSelect').textContent = row.name
			}

			tbody.appendChild(tr);
			tr.querySelector('.red').addEventListener('click', () => this.delete(row.group_id));

			if (tr.querySelector('.green')) {

				tr.querySelector('.green').addEventListener('click', () => this.update(row.group_id, row.multiSelect.value));
			}
		}

		if (!this.alreadyVisible.length) {

			tbody.innerHTML = '<tr class="NA"><td colspan="4">Not shared with anyone yet!</td></tr>'
		}

		this.sortTable.table = table;

		this.sortTable.sort();

		return table;
	}

	async insert(e) {

		if (e && e.preventDefault) {
			e.preventDefault();
		}

		const insertParams = new URLSearchParams();

		insertParams.append('owner', this.owner);
		insertParams.append('owner_id', this.ownerId);
		insertParams.append('target', this.selectedType.value);
		insertParams.append('target_id', this.targets[this.selectedType.value].is_category ? this.role : [...this.multiSelect.selectedValues][0]);

		if (this.targets[this.selectedType.value].ignore_categories) {

			insertParams.append('category_id', 0);
		}

		else {

			for (const categoryId of [...this.multiSelect.selectedValues]) {

				insertParams.append('category_id', categoryId);
			}
		}

		const options = {
			method: 'POST',
		};

		try {

			await API.call('object_roles/insert', insertParams.toString(), options);

			await this.load();

			this.render();

			new SnackBar({
				message: `${this.owner} shared with ${this.selectedType.value}`,
				icon: 'fas fa-share-alt',
			});

		} catch (e) {

			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message,
				type: 'error',
			});

			throw e;
		}

		this.multiSelect.clear();
	}

	async delete(group_id) {

		const
			parameters = {
				group_id: group_id,
			},
			options = {
				method: 'POST',
			};

		try {

			await API.call('object_roles/delete', parameters, options);

			await this.load();

			this.render();

			new SnackBar({
				message: 'Share Revoked',
				icon: 'far fa-trash-alt',
			});

		} catch (e) {

			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message,
				type: 'error',
			});

			throw e;
		}
	}

	async update(group_id, categories) {

		const updateParams = new URLSearchParams();

		updateParams.append('group_id', group_id);

		for (const categoryId of categories) {

			updateParams.append('category_id', categoryId);
		}

		const options = {
			method: 'POST',
		};

		try {

			await API.call('object_roles/update', updateParams.toString(), options);

			await this.load();

			this.render();

			new SnackBar({
				message: 'Share Updated',
				icon: 'far fa-trash-alt',
			});

		} catch (e) {

			new SnackBar({
				message: 'Request Failed',
				subtitle: e.message,
				type: 'error',
			});

			throw e;
		}
	}

	combine() {

		this.mapping = {};
		for (const target of this.allowedTargets) {

			if (!this.mapping[target]) {
				this.mapping[target] = {};
			}

			for (const row of this.targets[target].data) {

				this.mapping[target][row.value] = row;
			}
		}

		this.alreadyVisible = this.alreadyVisible.filter(row => row[this.targets[row.target].target_field || 'target_id'] in this.mapping[row.target]);

		for (const row of this.alreadyVisible) {

			row.name = this.mapping[row.target][row[this.targets[row.target].target_field || 'target_id']].name;
		}

		const groupIdMapping = {};

		for (const row of this.alreadyVisible) {

			if (!groupIdMapping.hasOwnProperty(row.group_id)) {

				groupIdMapping[row.group_id] = {};

				Object.assign(groupIdMapping[row.group_id], row);

				groupIdMapping[row.group_id].category_id = [];
			}

			groupIdMapping[row.group_id].category_id.push(row.category_id);
		}

		this.alreadyVisible = Object.values(groupIdMapping);
	}
}

/**
 * Show a snackbar type notification somewhere on screen.
 */
class SnackBar {

	static setup() {

		SnackBar.container = {
			'bottom-left': document.createElement('div'),
		};

		SnackBar.container['bottom-left'].classList.add('snack-bar-container', 'bottom-left', 'hidden');

		document.body.appendChild(SnackBar.container['bottom-left']);
	}

	/**
	 * Create a new Snackbar notification instance. This will show the notfication instantly.
	 *
	 * @param String	options.message		The message body.
	 * @param String	options.subtitle	The messgae subtitle.
	 * @param String	options.type		success (green), warning (yellow), error (red).
	 * @param String	options.icon		A font awesome name for the snackbar icon.
	 * @param Number	options.timeout		(Seconds) How long the notification will be visible.
	 * @param String	options.position	bottom-left (for now).
	 */
	constructor({message = null, subtitle = null, type = 'success', icon = null, timeout = 5, position = 'bottom-left'} = {}) {

		this.container = document.createElement('div');
		this.page = window.page;

		this.message = message;
		this.subtitle = subtitle;
		this.type = type;
		this.icon = icon;
		this.timeout = parseInt(timeout);
		this.position = position;

		if(!this.message)
			throw new Page.exception('SnackBar Message is required.');

		if(!parseInt(this.timeout))
			throw new Page.exception(`Invalid SnackBar timeout: ${this.timeout}.`);

		if(!['success', 'warning', 'error'].includes(this.type))
			throw new Page.exception(`Invalid SnackBar type: ${this.type}.`);

		if(!['bottom-left'].includes(this.position))
			throw new Page.exception(`Invalid SnackBar position: ${this.position}.`);

		if(this.subtitle && this.subtitle.length > 250)
			this.subtitle = this.subtitle.substring(0, 250) + '&hellip;';

		this.show();
	}

	show() {

		let icon = null;

		if(this.icon)
			icon = this.icon;

		else if(this.type == 'success')
			icon = 'fas fa-check';

		else if(this.type == 'warning')
			icon = 'fas fa-exclamation-triangle';

		else if(this.type == 'error')
			icon = 'fas fa-exclamation-triangle';

		let subtitle = '';

		if(this.subtitle)
			subtitle = `<div class="subtitle">${this.subtitle}</div>`;

		this.container.innerHTML = `
			<div class="icon"><i class="${icon}"></i></div>
			<div class="title ${subtitle ? '' : 'no-subtitle'}">${this.message}</div>
			${subtitle}
			<div class="close">&times;</div>
		`;

		this.container.classList.add('snack-bar', this.type);

		this.container.on('click', () => this.hide());

		// Add the show class out of the current event loop so that CSS transitions have time to initiate.
		setTimeout(() => this.container.classList.add('show'));

		// Hide the snackbar after the timeout.
		setTimeout(() => this.hide(), this.timeout * 1000);

		SnackBar.container[this.position].classList.remove('hidden');
		SnackBar.container[this.position].appendChild(this.container);
		SnackBar.container[this.position].scrollTop = SnackBar.container[this.position].scrollHeight;
	}

	/**
	 * Hide the snack bar and also hide the container if no other snackbar is in the container.
	 */
	hide() {

		this.container.classList.remove('show');

		setTimeout(() => {

			this.container.remove();

			if(!SnackBar.container[this.position].children.length)
				SnackBar.container[this.position].classList.add('hidden');

		}, Page.transitionDuration);
	}
}

/**
 *  Global and advance search bar
 */
class SearchColumnFilters extends Set {

	constructor({ filters, advancedSearch = true, data = [] } = {}) {

		super();

		this.data = data;
		this.filters = filters;

		this.globalSearch = new GlobalColumnSearchFilter(this, advancedSearch);

		this.add(this.globalSearch);

		this.render();
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');

		container.classList.add('hidden', 'search-column-filters');

		container.innerHTML = `
			<div class="filters"></div>
			<button type="button" class="add-filter">
				<i class="fa fa-plus"></i>
				Add New Parameter
			</button>
		`;

		container.querySelector('.add-filter').on('click', () => {

			this.add(new SearchColumnFilter(this));
			this.render();
			container.scrollTop = container.scrollHeight;

		});

		return container;
	}

	render() {

		const filters = this.container.querySelector('.filters');
		filters.textContent = null;

		for(const filter of this) {

			if(filter != this.globalSearch)
				filters.appendChild(filter.container);
		}

		if(this.size < 2)
			filters.innerHTML = '<div class="NA">No Filters Added</div>';
	}

	clear() {

		for(const filter of this) {

			if(filter != this.globalSearch) {

				this.delete(filter);
			}
		}
	}

	on(event, callback) {

		if(event != 'change')
			return;

		this.changeCallback = callback;
	}

	get filterData() {

		const filterData = [];

		outer:
		for(const row of this.data) {

			for(const filter of this) {

				if(!filter.checkRow(row))
					continue outer;
			}

			filterData.push(row);
		}

		return filterData;
	}
}

class SearchColumnFilter {

	constructor(searchColumns) {

		this.searchColumns = searchColumns;
	}

	get container() {

		if(this.containerElement)
			return this.containerElement;

		const container = this.containerElement = document.createElement('div');
		container.classList.add('search-column-filter');

		container.innerHTML = `
			<select class="searchValue"></select>
			<select class="searchType"></select>
			<input type="search" class="searchQuery" placeholder="Search">
			<button type="button" class="delete"><i class="far fa-trash-alt delete-icon"></i></button>
		`;

		const
			searchType = container.querySelector('.searchType'),
			searchQuery = container.querySelector('.searchQuery');

		searchQuery.on('keyup', () => this.searchColumns.changeCallback());
		searchQuery.on('search', () => this.searchColumns.changeCallback());

		for(const select of container.querySelectorAll('select')) {
			select.on('change', () => this.searchColumns.changeCallback());
		}

		searchType.on('change', () => {

			const disabled = ['empty', 'notempty'].includes(searchType.value);

			searchQuery.disabled = disabled;

			if(disabled) {
				searchQuery.value = '';
			}
		});

		for(const filter of DataSourceColumnFilter.types) {

			searchType.insertAdjacentHTML('beforeend', `
				<option value="${filter.slug}">
					${filter.name}
				</option>
			`);
		}

		const searchValue = container.querySelector('select.searchValue');

		for(const column of this.searchColumns.filters) {

			searchValue.insertAdjacentHTML('beforeend', `
				<option value="${column.key}">
					${column.key}
				</option>
			`);
		}

		container.querySelector('.delete').on('click', () => {

			this.searchColumns.delete(this);

			this.searchColumns.changeCallback();

			this.searchColumns.render();
		});

		return container;
	}

	checkRow(row) {

		const values = this.json;

		if(!values.query) {
			return true;
		}

		const [columnValue] = this.searchColumns.filters.filter(f => f.key == values.columnName).map(m => m.rowValue(row));

		if(!columnValue || !columnValue.length) {
			return false;
		}

		for(const column of DataSourceColumnFilter.types) {

			if(values.functionName != column.slug) {
				continue;
			}

			for(const value of columnValue) {

				if(value != null && column.apply(values.query, value)) {
					return true;
				}
			}

			return false;
		}
	}

	get json() {

		return {
			columnName: this.container.querySelector('select.searchValue').value,
			functionName: this.container.querySelector('select.searchType').value,
			query: this.container.querySelector('.searchQuery').value,
		};
	}

	set json(values = {}) {

		this.container.querySelector('select.searchValue').value = values.searchValue;
		this.container.querySelector('select.searchType').value = values.searchType;
		this.container.querySelector('.searchQuery').value = values.searchQuery;
	}
}

class GlobalColumnSearchFilter extends SearchColumnFilter {

	constructor(searchColumns, advancedSearch){

		super(searchColumns);

		this.searchColumns = searchColumns;
		this.advancedSearch = advancedSearch;
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = super.container;

		container.classList.add('global-filter');
		container.querySelector('.searchValue').classList.add('hidden');
		container.querySelector('.searchType').classList.add('hidden');
		container.querySelector('.delete').classList.add('hidden');

		if(this.advancedSearch) {

			container.insertAdjacentHTML('beforeend','<button type="button" class="advanced"><i class="fa fa-angle-down"></i></button>');

			container.querySelector('.advanced').on('click', () => {
				this.searchColumns.container.classList.toggle('hidden');
				container.querySelector('.advanced').classList.toggle('selected');

			});
		}
		return container;
	}

	checkRow(row) {

		const
			query = super.container.querySelector('.searchQuery').value,
			[contains] = DataSourceColumnFilter.types.filter(x => x.slug == 'contains');

		if(!query)
			return true;

		for(const column of this.searchColumns.filters) {

			for(const value of column.rowValue(row)) {

				if(value && contains.apply(query, value))
					return true;
			}
		}
	}
}

class NotificationBar {

	static setup() {

		NotificationBar.container = document.createElement('div');

		NotificationBar.container.classList.add('notification-bar-container');

		document.body.appendChild(NotificationBar.container);
	}

	/**
	 * Create a new NotificationBar notification instance. This will show the notfication instantly.
	 *
	 * @param String	options.message		The message body.
	 * @param String	options.type		notification (green), warning (yellow), error (red).
	 * @param boolean	options.allowClose	(true or false) Will show close button and close the navbar on clicking it.
	 */
	constructor({ message, type = 'success', allowClose = false } = {}) {

		this.container = document.createElement('div');
		this.page = window.page;

		this.message = message;
		this.allowClose = allowClose;
		this.type = type;

		if(!this.message) {
			return console.error('error - message is required');
		}

		if(!['warning', 'error', 'success'].includes(this.type)) {
			return console.error('error - type must be of success, error, warning.');
		}

		this.container.classList.add('notification-bar');

		this.page.container.parentElement.insertBefore(NotificationBar.container, this.page.container);

		this.show();
	}

	show() {

		this.container.innerHTML = `
			<div class="title">${this.message}</div>
		`;

		// Add close button if allowClose is true
		if(this.allowClose) {
			this.container.insertAdjacentHTML('beforeend', '<div class="close"><i class="far fa-times-circle" aria-hidden="true"></i></div>');
			this.on('click', () => this.hide());
		}

		this.container.classList.add(this.type);

		// Add the show class out of the current event loop so that CSS transitions have time to initiate.
		this.container.classList.add('show');

		NotificationBar.container.appendChild(this.container);
	}

	/**
	 * Hide the snack bar and also hide the container if no other snackbar is in the container.
	 */
	hide() {

		this.container.classList.remove('show');
		this.container.remove();

	}

	on(event, callback) {

		this.container.classList.add('action');

		if(event != 'click') {
			return console.error('error - only click event supported.');
		}

		this.container.on('click', () => callback());
	}
}

class SortTable {

	constructor({table} = {}) {

		this.table = table;
	}

	sort() {

		const headers = this.table.querySelectorAll('thead th');

		for(const [index, header] of headers.entries()) {

			if(header.clickListener) {
				header.removeEventListener('click', header.clickListener);
			}

			if(header.classList.contains('action') || header.attributes['data-no-sort']) {
				continue;
			}

			header.classList.add('tableHeaders');

			header.on('click', header.clickListener = () => {

				header.order = !header.order;

				const
					tbody = this.table.querySelector('tbody'),
					rows = Array.from(this.table.querySelectorAll('tbody tr'));

				rows.sort((a, b) => {

					a = a.children[index].attributes['data-sort-by'] ? a.children[index].attributes['data-sort-by'].value : a.children[index].textContent;
					b = b.children[index].attributes['data-sort-by'] ? b.children[index].attributes['data-sort-by'].value : b.children[index].textContent;

					if(a == b) {
						return 0;
					}

					if(!header.order) {
						[a, b] = [b, a];
					}

					return a.localeCompare(b, undefined, { ignorePunctuation: true, numeric: true });
				});

				for(const row of rows) {

					tbody.appendChild(row);
				}
			});
		}
	}
}

class FormatSQL {

	constructor(query) {

		this.query = ' ' + query;

		this.deflate();
		this.newLines();
		this.indentBrackets();
		this.indentSections();
		this.rollUp();
	}

	deflate() {

		this.query = this.query.replace(/\s+/g, ' ');
	}

	newLines() {

		const keywords = [
			'\\)',
			'SELECT',
			'FROM',
			'WHERE',
			'LEFT JOIN',
			'RIGHT JOIN',
			'INNER JOIN',
			'JOIN',
			'GROUP BY',
			'ORDER BY',
			'LIMIT',
			'HAVING',
			'ON',
			'AND',
			'OR',
		];

		this.query = this.query.replace(/\s\(\s/g, ' (\n');
		this.query = this.query.replace(/\n\(\s/g, '\n(\n');

		for(const keyword of keywords) {

			if(keyword == 'JOIN')
				this.query = this.query.replace(/(LEFT JOIN|RIGHT JOIN|INNER JOIN)/ig, (a, b) => b.replace(' ', '-'));

			this.query = this.query.replace(new RegExp(`\\s${keyword}\\s`, 'ig'), `\n${keyword.replace('\\', '')}\n`);

			if(keyword == 'JOIN')
				this.query = this.query.replace(/(LEFT-JOIN|RIGHT-JOIN|INNER-JOIN)/ig, (a, b) => b.replace('-', ' '));
		}
	}

	indentBrackets() {

		const result = [];

		let indent = 0;

		for(let line of this.query.split('\n')) {

			line = line.trim();

			if(!line)
				continue;

			if(line == ')')
				indent = Math.max(0, indent - 1);

			line = '\t'.repeat(indent) + line;

			if(line.endsWith('('))
				indent++;

			result.push(line);
		}

		this.query = result.join('\n');
	}

	indentSections() {

		const
			result = [],
			keywords = [
				'SELECT',
				'FROM',
				'WHERE',
				'LEFT JOIN',
				'RIGHT JOIN',
				'INNER JOIN',
				'JOIN',
				'GROUP BY',
				'ORDER BY',
				'HAVING',
				'LIMIT',
			];

		let
			indent = false,
			depth = 0;

		for(let line of this.query.split('\n')) {

			if(line.trim() == ')')
				depth = Math.max(0, depth - 1);

			line = '\t'.repeat(depth)  + line;

			if(line.endsWith('(') && indent) {
				depth++;
			}

			if(keywords.includes(line.trim()))
				indent = true;

			else if(indent)
				line = '\t' + line

			result.push(line);
		}

		this.query = result.join('\n');
	}

	rollUp() {

		/**
		 * foo = bar
		 * AND
		 * foo = bar
		 *
		 * truns into:
		 *
		 * foo = bar AND
		 * foo = bar
		 */
		const keywords = [
			'AND',
			'OR',
		];

		for(const keyword of keywords)
			this.query = this.query.replace(new RegExp(`\\n\\s*${keyword}`, 'g'), ' ' + keyword);

		/**
		 * FROM
		 * 	(
		 *
		 * turns into
		 *
		 * FROM (
		 */
		this.query = this.query.replace(/\n(\s*)FROM\n\s*\(\n/gi, (a, b) => `\n${b}FROM (\n`);

		/**
		 * foo, bar, baz(a, b)
		 *
		 * turns to
		 *
		 * foo,
		 * bar,
		 * baz(a, b)
		 */
		{
			const result = [];
			let select = false;

			for(let line of this.query.split('\n')) {

				const depth = Math.max(line.match(/\s*/)[0].split('\t').length - 1, 0);

				if(select) {
					line = line.replace(/,\s/ig, ',');
					line = line.replace(/,(?![^()]*\))/ig, ',\n' + '\t'.repeat(depth));
					select = false;
				}

				if(line.trim().toLowerCase() == 'select')
					select = true;

				result.push(line);
			}

			this.query = result.join('\n');
		}
	}
}

class Documentation {

	constructor(documentation, page, parent) {

		Object.assign(this, documentation);
		this.parent = parent;
		this.page = page;
	}

	async load() {

		if('body' in this) {
			return;
		}

		this.initilizeBody = await API.call('documentation/get', {id: this.id});
	}

	get container() {

		const container = document.createElement('div');
		container.classList.add('body');

		container.appendChild(this.bodyContainer);

		for(const child of this.children.values()) {
			container.appendChild(child.container);
		}

		return container;
	}

	set headingSize(size) {

		this.bodyContainer.querySelector('.heading').innerHTML = `
			<h${size}>${this.completeChapter} ${this.heading}</h${size}>
		`;

		if(!this.children.size) {
			return;
		}

		size++;

		for(const child of this.children.values()) {
			child.headingSize = size;
		}
	}

	get bodyContainer() {

		if(this.bodyContainerElement) {
			return this.bodyContainerElement;
		}

		const container = this.bodyContainerElement = document.createElement('div');

		container.innerHTML = `
			<div class="heading"></div>
			<p>${this.body || '<span class="NA">No content added.</span>'}</p>
		`;

		return container;
	}

	set initilizeBody(text) {

		this.body = text.filter(x => x.id == this.id)[0].body;

		if(!this.children.size) {
			return;
		}

		for(const child of this.children.values()) {
			child.initilizeBody = text;
		}
	}

	get completeChapter() {

		let parent = this.parent;
		const chapter = [this.chapter];

		while(parent) {
			chapter.push(parent.chapter);
			parent = parent.parent;
		}

		return chapter.reverse().join('.');
	}
}

if(typeof Node != 'undefined') {
	Node.prototype.on = window.on = function(name, fn) {
		this.addEventListener(name, fn);
	}
}

Date.nowUTC = function() {

	const today = new Date();

	return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), today.getHours(), today.getMinutes(), today.getSeconds())).getTime();
}

Date.prototype.getTimeUTC = function() {
	return new Date(Date.UTC(this.getFullYear(), this.getMonth(), this.getDate(), this.getHours(), this.getMinutes(), this.getSeconds())).getTime();
}

MetaData.timeout = 5 * 60 * 1000;
Page.animationDuration = 750;
Page.transitionDuration = 300;

if(typeof window != 'undefined')
	window.onerror = ErrorLogs.send;