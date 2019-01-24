class SettingsManager {

	constructor({owner, owner_id, format, disable_aside = false} = {}) {

		this.owner = owner;
		this.owner_id = owner_id;
		this.format = format;
		this.disable_aside = disable_aside;

		this.profiles = new Map;
		this.callbacks = new Map;

		this.sortTable = new SortTable();
	}

	async load() {

		await this.fetch();
		this.process();
		this.render();

		this.sortTable.table = this.container.querySelector('table');
		this.sortTable.sort();
	}

	async fetch() {

		const
			option = {
				method: "GET",
			},
			parameter = {
				owner_id: this.owner_id,
				owner: this.owner,
			};

		this.response = await API.call('settings/list', parameter, option);
	}

	process() {

		this.profiles.clear();

		for(const data of this.response) {
			this.profiles.set(data.id, new SettingsManagerProfile(data, this));
		}

		if(!this.profiles.selected && this.profiles.size) {
			this.profiles.selected = Array.from(this.profiles.values())[0];
		}
	}

	render() {

		const tbody = this.container.querySelector('table tbody');

		tbody.textContent = null;

		for(const data of this.profiles.values()) {
			tbody.appendChild(data.row);
		}

		if(!this.profiles.size) {
			tbody.innerHTML = `<tr><td colspan="2" class="NA">No profile found</td></tr>`;
		}

		if(this.container.querySelector('section.profile')) {
			this.container.querySelector('section.profile').remove();
		}

		this.container.querySelector('.no-profile').classList.toggle('hidden', this.profiles.selected ? true : false);

		for(const [key, profiles] of this.profiles) {
			profiles.row.classList.remove('selected');
		}

		if(this.profiles.selected) {
			this.profiles.selected.row.classList.add('selected');
			this.container.appendChild(this.profiles.selected.section);
		}
	}

	get container() {

		if(this.containerElement) {
			return this.containerElement;
		}

		const container = this.containerElement = document.createElement('div');
		container.classList.add('settings-manager');

		container.innerHTML = `
			<aside>
				<table>
					<thead>
						<tr>
							<th>Name</th>
							<th class="action">Delete</th>
						</tr>
					</thead>

					<tbody></tbody>
				</table>

				<footer>
					<form class="form">
						<label>
							<input type="text" name="profile"  maxLength="30" placeholder="New Profile's Name" required>
						</label>

						<label>
							<button type="submit"><i class="fa fa-plus"></i> Add</button>
						</label>
					</form>
				</footer>
			</aside>

			<div class="no-profile">No Profile Selected</div>
		`;

		if(this.disable_aside) {
			container.classList.add('aside-hidden');
		}

		container.querySelector('form').on('submit', e => {

			e.preventDefault();
			this.add();
		});

		return container;
	}

	async add() {

		const form = this.container.querySelector('form');

		const
			parameter = {
				owner_id: this.owner_id,
				owner: this.owner,
				value: JSON.stringify([]),
			},
			options = {
				method: 'POST',
				form: new FormData(form),
			};

		try {

			const response = await API.call('settings/insert', parameter, options);

			form.profile.value = null;

			await this.load();

			this.profiles.get(response.insertId).edit();

			new SnackBar({
				message: this.owner + ' Settings Profile Added',
				subtitle: `${form.profile.value}`,
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

	on(event, callback) {

		if(!this.callbacks.has(event)) {
			this.callbacks.set(event, new Set);
		}

		this.callbacks.get(event).add(callback);
	}
}

class SettingsManagerProfile {

	constructor(setting, settingsManager) {

		for(const key in setting) {
			this[key] = setting[key];
		}

		this.settingsManager = settingsManager;
	}

	get row() {

		if(this.tr)
			return this.tr;

		const tr = this.tr = document.createElement('tr');

		tr.innerHTML = `
			<td>${this.profile}</td>
			<td class="action red"><i class="far fa-trash-alt"></i></td>
		`;

		tr.on('click', () => this.edit());
		tr.querySelector('.action').on('click', (e) => {
			e.stopPropagation();
			this.delete()
		});

		return tr;
	}

	edit() {

		this.settingsManager.profiles.selected = this;

		this.settingsManager.render();
	}

	get section() {

		if(this.sectionElement) {
			return this.sectionElement;
		}

		const section = this.sectionElement = document.createElement('section');

		section.classList.add('profile');

		section.innerHTML = `
			<header>
				<h3>${this.profile}</h3>
				<input type="search" placeholder="Search...">
				<button type="submit" form="settings-form"><i class="far fa-save"></i> Save</button>
			</header>

			<form id="settings-form" class="form">
				<label>
					<span>Profile Name</span>
					<input type="text" required name="name" maxLength="30" placeholder="Name" value="${this.profile}">
				</label>
			</form>
		`;

		section.querySelector('header input[type=search]').on('keyup', () => this.search());

		this.settings = [];

		for(const format of this.settingsManager.format) {

			let setting = SettingsManager.types.get(format.type.toLowerCase());

			if(!setting) {
				continue;
			}

			setting = new setting(format);

			for(const value of this.value || []) {

				if(format.key == value.key) {
					setting.value = value.value;
				}
			}

			this.settings.push(setting);
		}

		const form = this.section.querySelector('form');

		for(const setting of this.settings) {
			form.appendChild(setting.container);
		}

		section.querySelector('form').on('submit', (e) => this.update(e));

		return section;
	}

	async update(e) {

		e.preventDefault();

		const value = this.settings.map(x => {

			return {
				key: x.key,
				value: x.key == 'external_parameters' ? Array.isArray(x.value) ? x.value : [] : x.value
			}

		});

		const
			parameters = {
				profile: this.section.querySelector('form').name.value,
				id: this.id,
				value: JSON.stringify(value),
				owner: this.owner,
				owner_id: this.owner_id,
			},
			options = {
				method: 'POST',
			};

		try {

			await API.call('settings/update', parameters, options);

			await page.serviceWorker.clear();

			await this.settingsManager.load();

			this.settingsManager.profiles.get(this.id).edit();

			new SnackBar({
				message: this.owner + ' Settings Profile Saved',
				subtitle: this.profile,
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

		// Call any assigned callbacks when the settings are saved
		for(const callback of this.settingsManager.callbacks.get('submit') || []) {
			callback();
		}
	}

	async delete(e) {

		const
			options = {
				method: "POST"
			},
			parameters = {
				id: this.id,
				owner: this.owner,
				owner_id: this.owner_id,
			};

		try {

			await API.call('settings/delete', parameters, options);

			await page.serviceWorker.clear();

			this.settingsManager.profiles.selected = null;

			await this.settingsManager.load();

			new SnackBar({
				message: this.owner + ' Settings Profile Deleted',
				subtitle: this.profile,
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

	search() {

		const query = this.section.querySelector('header input[type=search]').value;

		for(const setting of this.settings) {

			let found = false;

			if(!query) {
				found = true;
			}

			for(const key of ['key', 'name', 'description', 'type']) {

				if(setting[key] && setting[key].toLowerCase().includes(query.toLowerCase())) {
					found = true;
					break;
				}
			}

			setting.container.classList.toggle('hidden', !found);
		}
	}
}

class SettingsManagerType {

	constructor(format) {

		for(const key in format) {
			this[key] = format[key];
		}
	}
}

SettingsManager.types = new Map;

SettingsManager.types.set('string', class extends SettingsManagerType {

	get container() {

		if(this.div) {
			return this.div;
		}

		const container = this.div = document.createElement('label');

		container.innerHTML = `
			<span>${this.name}</span>
			${this.description ? '<small class="NA">' + this.description + '</small>' : ''}
			<input type="text" placeholder="String">
		`;

		return container;
	}

	get value() {

		return this.container.querySelector('input').value;
	}

	set value(param) {

		this.container.querySelector('input').value = param;
	}
});

SettingsManager.types.set('url', class extends SettingsManagerType {

	get container() {

		if(this.div) {
			return this.div;
		}

		const container = this.div = document.createElement('label');

		container.innerHTML = `
			<span>${this.name}</span>
			${this.description ? '<small class="NA">' + this.description + '</small>' : ''}
			<input type="url" placeholder="Url">
		`;

		return container;
	}

	get value() {

		return this.container.querySelector('input').value;
	}

	set value(param) {

		this.container.querySelector('input').value = param;
	}
});

SettingsManager.types.set('toggle', class extends SettingsManagerType {

	get container() {

		if(this.div) {
			return this.div;
		}

		const container = this.div = document.createElement('label');

		container.innerHTML = `
			<span>${this.name}</span>
			${this.description ? '<small class="NA">' + this.description + '</small>' : ''}
			<select>
				<option value="0">Disabled</option>
				<option value="1">Enabled</option>
			</select>
		`;

		return container;
	}

	get value() {

		return parseInt(this.container.querySelector('select').value);
	}

	set value(param) {

		this.container.querySelector('select').value = param;
	}
});

SettingsManager.types.set('number', class extends SettingsManagerType {

	get container() {

		if(this.div) {
			return this.div;
		}

		const container = this.div = document.createElement('label');

		container.innerHTML = `
			<span>${this.name}</span>
			${this.description ? '<small class="NA">' + this.description + '</small>' : ''}
			<input type="number" value="" placeholder="Number">
		`;

		return container;
	}

	get value() {

		return this.container.querySelector('input').value;
	}

	set value(param) {

		this.container.querySelector('input').value = param;
	}
});

SettingsManager.types.set('code', class extends SettingsManagerType {

	get container() {

		if(this.div) {
			return this.div;
		}

		const container = this.div = document.createElement('label');
		container.classList.add('code-editor');

		container.innerHTML = `
			<span>${this.name}</span>
			${this.description ? '<small class="NA">' + this.description + '</small>' : ''}
			<div class="edit">
				<div class="content"></div>
				<div class="click-to-edit">Click to edit</div>
			</div>
		`;

		container.querySelector('.click-to-edit').on('click', () => this.renderEditor());

		return container;
	}

	renderEditor() {

		this.div.querySelector('.edit').classList.add('hidden');
		this.div.querySelector('.click-to-edit').classList.add('hidden');

		this.editor = new CodeEditor({mode: this.mode});

		this.div.appendChild(this.editor.container);

		this.editor.value = this.data;
	}

	get value() {

		if(this.editor) {
			return this.editor.value;
		}

		return this.data;
	}

	set value(data = '') {

		this.data = data;

		if(this.editor) {
			this.editor.value = this.data;
		}
		else {
			this.container.querySelector('.edit .content').textContent = this.data.split(';')[0];
		}
	}
});

SettingsManager.types.set('json', class extends SettingsManagerType {

	get container() {

		if(this.div) {
			return this.div;
		}

		const container = this.div = document.createElement('label');

		container.classList.add('code-editor');

		container.innerHTML = `
			<span>${this.name}</span>
			${this.description ? '<small class="NA">' + this.description + '</small>' : ''}
			<div class="edit">
				<div class="content"></div>
				<div class="click-to-edit">Click to edit</div>
			</div>
		`;

		container.querySelector('.click-to-edit').on('click', () => this.renderEditor());

		return container;
	}

	renderEditor() {

		this.div.querySelector('.edit').classList.add('hidden');
		this.div.querySelector('.click-to-edit').classList.add('hidden');

		this.editor = new CodeEditor({mode: 'json'});

		this.div.appendChild(this.editor.container);

		this.editor.value = JSON.stringify(this.data, 0, 4);
	}

	get value() {

		if(this.editor) {
			return JSON.parse(this.editor.value);
		}

		return this.data;
	}

	set value(data = {}) {

		this.data = data;

		const value = JSON.stringify(this.data, 0, 4);

		if(this.editor) {
			this.editor.value = value;
		}
		else {
			this.container.querySelector('.edit .content').textContent = value.split('')[0];
		}
	}
});

SettingsManager.types.set('multiselect', class extends SettingsManagerType {

	constructor(format) {

		super(format);

		this.multiselect = new MultiSelect({datalist: this.datalist, multiple: this.multiple, dropDownPosition: this.dropDownPosition});
	}

	get container() {

		if(this.div) {
			return this.div;
		}

		const container = this.div = document.createElement('label');

		container.innerHTML = `
			<span>${this.name}</span>
			${this.description ? '<small class="NA">' + this.description + '</small>' : ''}
		`;

		container.appendChild(this.multiselect.container);

		return container;
	}

	get value() {

		return this.multiple ? this.multiselect.value : this.multiselect.value[0];
	}

	set value(params) {

		if(!Array.isArray(params)) {
			params = [params];
		}

		this.multiselect.value = params;
	}
});