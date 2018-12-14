"use strict";

const express = require('express');
const router = express.Router();
const config = require('config');
const {promisify} = require('util');
const fs = require('fs');
const API = require('../server/utils/api');
const User = require('../server/utils/User');
const commonFunctions = require('../server/utils/commonFunctions');
const authentication = require('../server/www/authentication');
const {URLSearchParams} = require('url');

router.use(express.static('./client'));

class HTMLAPI extends API {

	constructor() {

		super();

		this.stylesheets = [
			'/css/main.css',
			'https://use.fontawesome.com/releases/v5.2.0/css/all.css" integrity="sha384-hWVjflwFxL6sNzntih27bfxkr27PmbbK/iSvJ+a4+0owXq79v+lsFkW54bOGbiDQ" crossorigin="anonymous" f="'
		];

		this.scripts = [
			'/js/main.js',
			'https://cdnjs.cloudflare.com/ajax/libs/ace/1.3.3/ace.js',
		];
	}

	async body() {

		let theme = 'light';

		if(this.request.query.download) {

			const token_details = await commonFunctions.getUserDetailsJWT(this.request.query.refresh_token);

			if(!token_details.error) {
				this.user = new User(token_details);
			}
		}

		if(!this.user && (this.request.cookies.token)) {

			const token_details = await commonFunctions.getUserDetailsJWT(this.request.cookies.token);

			if(!token_details.error)
				this.user = new User(token_details);
		}

		if(await this.account.settings.get('theme'))
			theme = await this.account.settings.get('theme');

		if(this.user && await this.user.settings.get('theme'))
			theme = await this.user.settings.get('theme');

		this.stylesheets.push(`/css/themes/${theme}.css`);

		if(this.account.settings.has('custom_css'))
			this.stylesheets.push('/css/custom.css');

		if(this.account.settings.get('custom_js'))
			this.scripts.push('/js/custom.js');

		let ga = '';

		if(config.has('ga_id')) {
			ga = `
				<script async src="https://www.googletagmanager.com/gtag/js?id=${config.get('ga_id')}"></script>
				<script>
					window.dataLayer = window.dataLayer || [];
					function gtag(){dataLayer.push(arguments);}
					gtag('js', new Date());

					gtag('config', '${config.get('ga_id')}');
				</script>
			`;
		}

		return `<!DOCTYPE html>
			<!--
				           _ _  _____                  _
				     /\\   | | |/ ____|                | |
				    /  \\  | | | (___  _ __   __ _ _ __| | __
				   / /\\ \\ | | |\\___ \\| '_ \\ / _\` | '__| |/ /
				  / ____ \\| | |____) | |_) | (_| | |  |   <
				 /_/    \\_\\_|_|_____/| .__/ \\__,_|_|  |_|\\_\\
				                     | |
				                     |_|
				   Welcome to the source, enjoy your stay.
		Find the entire code at https://github.com/Jungle-Works/AllSpark
			-->
			<html lang="en">
				<head>
					<meta name="viewport" content="width=device-width, initial-scale=1">
					<meta name="theme-color" content="#3e7adc">
					<title></title>
					<link id="favicon" rel="shortcut icon" type="image/png" href="" />

					${this.stylesheets.map(s => '<link rel="stylesheet" type="text/css" href="' + s + '?' + this.checksum + '">\n\t\t\t\t\t').join('')}
					${this.scripts.map(s => '<script src="' + s + '?' + this.checksum + '"></script>\n\t\t\t\t\t').join('')}

					<link rel="manifest" href="/manifest.webmanifest">
					${ga}
					<script>
						let onboard = '${config.has('onboard') ? JSON.stringify(config.get('onboard')) : ''}';
						var environment = ${JSON.stringify(this.environment) || '{}'};
					</script>
				</head>
				<body>

					<div id="ajax-working"></div>

					<main>
						${this.main ? await this.main() || '' : ''}
					</main>
				</body>
			</html>
		`;
	}
}

router.get('/service-worker.js', API.serve(class extends HTMLAPI {

	async body() {

		this.response.setHeader('Content-Type', 'application/javascript');

		return [
			await (promisify(fs.readFile))('client/js/service-worker.js', {encoding: 'utf8'}),
			`'${this.checksum}'`
		].join('\n');
	}
}));

router.get('/css/custom.css', API.serve(class extends HTMLAPI {

	async body() {

		this.response.setHeader('Content-Type', 'text/css');

		return this.account.settings.get('custom_css') || '';
	}
}));

router.get('/js/custom.js', API.serve(class extends HTMLAPI {

	async body() {

		this.response.setHeader('Content-Type', 'text/javascript');

		return this.account.settings.get('custom_js') || '';
	}
}));

router.get('/account-signup', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/account-signup.css');
		this.scripts.push('/js/account-signup.js');
	}

	async main() {

		return `
			<section class="section" id="signup">
				<h1>Signup Page</h1>

				<div class="toolbar">
					<button id="back"><i class="fa fa-arrow-left"></i> Back</button>
					<button type="submit" form="signup-form"><i class="far fa-save"></i> Sign up</button>
					<span class="notice hidden"></span>
				</div>

				<form class="block form" id="signup-form">

					<h3>Account Details</h3>
					<label>
						<span>Account Name</span>
						<input type="text" name="name" required>
					</label>
					<label>
						<span>Url</span>
						<input type="text" name="url" required>
					</label>
					<label>
						<span>Icon</span>
						<input type="text" name="icon">
					</label>
					<label>
						<span>Logo</span>
						<input type="text" name="logo">
					</label>

					<h3>Admin Details</h3>

					<label>
						<span>First Name</span>
						<input type="text" name="first_name">
					</label>
					<label>
						<span>Middle Name</span>
						<input type="text" name="middle_name">
					</label>
					<label>
						<span>Last Name</span>
						<input type="text" name="last_name">
					</label>
					<label>
						<span>Email</span>
						<input type="email" name="email" required>
					</label>
					<label>
						<span>Password</span>
						<input type="password" name="password" required>
					</label>
					<label>
						<span>Phone</span>
						<input type="text" name="phone">
					</label>
				</form>
			</section>
		`;
	}
}));

router.get('/login', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/login.css');
		this.scripts.push('/js/login.js');
	}

	async main() {

		if(this.request.query.email && this.request.query.password) {
			this.request.body.email = this.request.query.email;
			this.request.body.password = this.request.query.password;
		}

		if((this.account.settings.has('external_parameters') && this.request.query.external_parameters) || (this.request.query.email && this.request.query.password)) {

			let externalParameters = [];

			if(Array.isArray(this.account.settings.get('external_parameters'))) {

				externalParameters = this.account.settings.get('external_parameters');
			}

			const external_parameters = {};

			for(const key of externalParameters) {

				if(key.name in this.request.query) {

					this.request.body['ext_' + key.name] = this.request.query[key.name] || key.value;
				}

				external_parameters[key.name] = this.request.query[key.name] == undefined ? key.value : this.request.query[key.name];
			}

			this.request.body.account_id = this.account.account_id;

			const
				loginObj = new authentication.login(this),
				refreshObj = new authentication.refresh(this);

			loginObj.request = this.request;
			refreshObj.request = this.request;

			const response = await loginObj.login();

			if(!response.jwt && response.length)
				throw new Error("User not found!");

			refreshObj.request.body.refresh_token = response.jwt;

			const urlSearchParams = new URLSearchParams();

			urlSearchParams.set('refresh_token', response.jwt);
			urlSearchParams.set('token', await refreshObj.refresh());
			urlSearchParams.set('external_parameters', JSON.stringify(external_parameters));

			this.response.redirect('/dashboard/first/?' + urlSearchParams);

			throw({"pass": true});
		}

		return `
			<div class="logo hidden">
				<img src="" />
			</div>

			<section id="loading" class="section form">
				<i class="fa fa-spinner fa-spin"></i>
			</section>

			<section id="accept-email" class="section">
				<form class="form">

					<label>
						<span>Email</span>
						<input type="email" name="email" required>
					</label>

					<div>
						<a href="/login/forgot" class="forgot-password hidden">Forgot Password?</a>
						<button class="submit">
							<i class="fas fa-arrow-right"></i>
							Next
						</button>
					</div>
				</form>
			</section>

			<section id="accept-account" class="section"></section>

			<section id="accept-password" class="section">
				<form class="form">

					<label>
						<span>Email</span>
						<input type="email" name="email" disabled required>
					</label>

					<label>
						<span>Password</span>
						<input type="password" name="password" required>
					</label>

					<div>
						<a id="password-back"><i class="fas fa-arrow-left"></i> &nbsp;Back</a>
						<button class="submit">
							<i class="fas fa-sign-in-alt"></i>
							Sign In
						</button>
					</div>
				</form>
			</section>

			<section id="message"></section>

			<div id="signup" class="hidden">
				${this.account.settings.get('enable_account_signup') ? 'Or Create a <a href="/account-signup">new account</a>' : ''}
			</div>
		`;
	}
}));

router.get('/login/forgot', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/login.css');
		this.scripts.push('/js/forgotpassword.js');
	}

	async main() {
		return `

			<div class="logo hidden">
				<img src="" />
			</div>

			<section id="accept-email" class="section show">

				<form class="form forgot">

					<label>
						<span>Email</span>
						<input type="email" name="email" required>
					</label>

					<div>
						<a href='/login'><i class="fa fa-arrow-left"></i> &nbsp;Login</a>
						<button class="submit">
							<i class="fa fa-paper-plane"></i>
							Send Link
						</button>
					</div>
				</form>

			</section>

			<section id="accept-account" class="section"></section>

			<div id="message" class="hidden"></div>
		`;
	}
}));

router.get('/login/reset', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/login.css');
		this.scripts.push('/js/resetpassword.js');
	}

	async main() {
		return `
			<div class="logo hidden">
				<img src="" />
			</div>

			<form class="form reset">

				<label>
					<span>Email</span>
					<input name="email" disabled>
				</label>

				<label>
					<span>New Password</span>
					<input type="password" name="password" required>
				</label>

				<span class="account"></span>

				<div>
					<button class="submit">
						<i class="fa fa-paper-plane"></i>
						Change Password
					</button>
				</div>
			</form>

			<div id="message" class="hidden"></div>
		`;
	}
}));

router.get('/user/settings/:id?', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/user/settings.css');
		this.stylesheets.push('/css/settings-manager.css');
		this.scripts.push(
			'/js/user/settings.js',
			'/js/settings-manager.js',
			'/js/reports.js');
	}

	async main() {

		return `

			<div class="change-password hidden">
				<h3>Change Password</h3>
				<form class="block form">

					<label>
						<span>Old Password <span class="red">*</span></span>
						<input type="password" name="old_password" required>
					</label>

					<label>
						<span>New Password <span class="red">*</span></span>
						<input type="password" name="new_password" required>
					</label>

					<label>
						<span></span>
						<button class="submit">
							<i class="far fa-save"></i>
							Change
						</button>
					</label>
				</form>
			</div>

			<div class="user-settings">

				<h3>User Settings</h3>

			</div>
		`;
	}
}));

router.get('/user/profile/:id?', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/user/profile.css');
		this.scripts.push('/js/reports.js');
		this.scripts.push('/js/user/profile.js');
	}

	async main() {
		return `

			<div class="details">

				<h1>
					<span>&nbsp;</span>
				</h1>
			</div>

			<div class="switch">
				<div class="heading-bar">
					<label class="info selected">
						<h3>Info</h3>
					</label>
					<label class="access">
						<h3>Access</h3>
					</label>
					<label class="activity">
						<h3>Activity</h3>
					</label>
				</div>

				<section class="section show" id="profile-info">
					<div class="spinner">
						<i class="fa fa-spinner fa-spin"></i>
					</div>
				</section>

				<section class="section" id="access">
					<h2>Privileges</h2>
					<p>
						Privileges define what <strong>actions</strong> the user can perform.<br>
						<span class="NA">For Example: Manage Reports, Users, Connections, Dashboards, etc</span>
					</p>
					<table class="privileges">
						<thead>
							<tr>
								<th>Category</th>
								<th>Privilege</th>
							</tr>
						</thead>
						<tbody></tbody>
					</table>

					<h2>Roles</h2>
					<p>
						Roles define what <strong>data</strong> the user can view.<br>
						<span class="NA">For Example: <em>Merchant Dashboard</em>, <em>Production MySQL</em> (Connection), <em>Delivery Analysys Report</em> etc</span>
					</p>
					<table class="roles">
						<thead>
							<tr>
								<th>Category</th>
								<th>Role</th>
							</tr>
						</thead>
						<tbody></tbody>
					</table>
				</section>

				<section class="section activity-info" id="activity"></section>
			</div>
		`;
	}
}));

router.get('/streams', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.scripts = this.scripts.concat([
			'/js/streams.js',
			'/js/streams-test.js',

			'https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.17/d3.min.js',
		]);
	}

	async main() {
		return ''
	}
}));

router.get('/:type(dashboard|report|visualization)/:id?', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets = this.stylesheets.concat([
			'/css/reports.css',
			'/css/dashboard.css',
		]);

		this.scripts = this.scripts.concat([
			'/js/reports.js',
			'/js/dashboard.js',

			'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/markerclusterer.js" defer f="',
			'https://maps.googleapis.com/maps/api/js?key=AIzaSyA_9kKMQ_SDahk1mCM0934lTsItV0quysU&libraries=visualization" defer f="',

			'https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.17/d3.min.js',
		]);
	}

	async main() {

		return `
			<nav>
				<label class="dashboard-search hidden">
					<input type="search" name="search" placeholder="Search..." >
				</label>

				<div class="dashboard-hierarchy"></div>

				<footer>

					<div class="collapse-panel">
						<span class="left"><i class="fa fa-angle-double-left"></i></span>
					</div>
				</footer>
			</nav>
			<div class="nav-blanket hidden"></div>
			<section class="section" id="list">
				<h2>${this.request.params.type}</h2>

				<div class="form toolbar"></div>

				<table class="block">
					<thead></thead>
					<tbody></tbody>
				</table>
			</section>

			<section class="section" id="reports">

				<h1 class="dashboard-name"></h1>

				<div class="toolbar form hidden">

					<button id="back">
						<i class="fa fa-arrow-left"></i>
						Back
					</button>

					<button id="edit-dashboard" class="hidden">
						<i class="fa fa-edit"></i>
						Edit
					</button>

					<button id="mailto" class="hidden">
						<i class="fas fa-envelope"></i>
						Email
					</button>

					<button id="configure" class="hidden">
						<i class="fas fa-cog"></i>
						Configure
					</button>

					<button id="share">
						<i class="fas fa-share"></i>
						Share
					</button>

					<div class="download">
						<button>
							<i class="fas fa-download"></i>
							Download
						</button>
						<div class="options hidden">
							<span class="item pdf">
								<i class="far fa-file-pdf"></i>
								<div>
									PDF&nbsp;
									<span class="NA">BETA</span>
								</div>
							</span>
							<span class="item png">
								<i class="far fa-image"></i>
								PNG
							</span>
							<span class="item jpeg">
								<i class="far fa-file-image"></i>
								JPEG
							</span>
						</div>
					</div>

					<button id="full-screen">
						<i class="fas fa-expand"></i>
						Full Screen
					</button>
				</div>

				<form class="form mailto-content hidden">
					<label>
						<span>Send to</span>
						<input type="email" name="email">
					</label>
					<label>
						<span>Subject</span>
						<input type="text" name="subject">
					</label>
					<label>
						<span>Body</span>
						<input type="text" name="body">
					</label>
					<button type="submit"><i class="fa fa-paper-plane"></i> Send</button>
				</form>
				<div class="global-filters form"></div>

				<div class="list"></div>
				<div id="blanket" class="hidden"></div>
				<button type="button" class="side">
					<i class="fas fa-filter"></i>
				</button>
			</section>
		`;
	}
}));

router.get('/dashboards-manager/:id?', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets = this.stylesheets.concat([
			'/css/reports.css',
			'/css/dashboards-manager.css',
		]);

		this.scripts = this.scripts.concat([
			'/js/reports.js',
			'/js/dashboards-manager.js'
		]);
	}

	async main() {
		return `
			<section class="section" id="list">

				<div class="heading">
					<button id="add-dashboard" type="button" class="grey">
						<i class="fa fa-plus"></i>
					</button>
					<h1>Manage Dashboards</h1>
				</div>

				<div class="dashboards"></div>
			</section>

			<section class="section" id="form">
				<h1></h1>

				<div class="toolbar">
					<button id="back"><i class="fa fa-arrow-left"></i> Back</button>
					<button type="submit" form="dashboard-form"><i class="far fa-save"></i> Save</button>
				</div>

				<form class="block form" id="dashboard-form">

					<label>
						<span>Name <span class="red">*</span></span>
						<input type="text" name="name" required>
					</label>

					<label class="parent-dashboard">
						<span>Parent</span>
					</label>

					<label>
						<span>Icon</span>
						<input type="text" name="icon">
					</label>

					<label>
						<span>Order</span>
						<input type="number" min="0" step="1" name="order">
					</label>

					<label id="format">
						<span>Format</span>
					</label>
				</form>

				<h2 class="share-heading">Share dashboards</h2>
				<div id="share-dashboards"></div>
			</section>
		`;
	}
}));

router.get('/reports/:stage?/:id?', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets = this.stylesheets.concat([
			'/css/reports.css',
			'/css/reports-manager.css',
		]);

		this.scripts = this.scripts.concat([
			'/js/reports.js',
			'/js/reports-manager.js',

			'https://cdnjs.cloudflare.com/ajax/libs/ace/1.3.3/ext-language_tools.js',

			'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/markerclusterer.js" defer f="',
			'https://maps.googleapis.com/maps/api/js?key=AIzaSyA_9kKMQ_SDahk1mCM0934lTsItV0quysU&libraries=visualization" defer f="',

			'https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.17/d3.min.js',
			'https://devpreview.tiny.cloud/demo/tinymce.min.js',
		]);
	}

	async main() {
		return `
			<div id="stage-switcher"></div>

			<div id="stages">
				<section class="section" id="stage-pick-report">

					<form class="toolbar filters">

						<button type="button" class="grey" id="add-report">
							<i class="fa fa-plus"></i>
							Add New Report
						</button>
					</form>

					<div id="list-container">
						<table>
							<thead>
								<tr class="search"></tr>
								<tr>
									<th class="sort search" data-key="query_id">ID</th>
									<th class="sort search" data-key="name" >Name</th>
									<th class="sort search" data-key="connection">Connection </th>
									<th class="sort search" data-key="tags">Tags</th>
									<th class="sort search" data-key="filters">Filters</th>
									<th class="sort search" data-key="visualizations">Visualizations</th>
									<th class="sort search" data-key="is_enabled">Enabled</th>
									<th class="action">Configure</th>
									<th class="action">Define</th>
									<th class="action">Delete</th>
								</tr>
							</thead>
							<tbody></tbody>
						</table>
					</div>
				</section>

				<section class="section" id="stage-configure-report">

					<header class="toolbar">
						<button type="submit" form="configure-report-form" class="save-configure-stage"><i class="far fa-save"></i> Save</button>
						<span id="added-by" class="NA"></span>
					</header>

					<form id="configure-report-form">

						<div class="form">
							<label>
								<span>Name <span class="red">*</span></span>
								<input type="text" name="name" required>
							</label>

							<label>
								<span>Connection <span class="red">*</span></span>
								<select name="connection_name" required></select>
							</label>

							<label>
								<span>Tags <span class="right NA">Comma Separated</span></span>
								<input type="text" name="tags">
							</label>

							<label>
								<span>Category</span>
								<select name="subtitle"></select>
							</label>
						</div>

						<div class="form">

							<label>
								<span>Refresh Rate <span class="right NA">Seconds</span></span>
								<input type="number" name="refresh_rate" min="0" step="1">
							</label>

							<label>
								<span>Store Result</span>
								<select name="load_saved">
									<option value="1">Enabled</option>
									<option value="0" selected>Disabled</option>
								</select>
							</label>

							<label>
								<span>Redis <span class="right NA">Seconds</span></span>

								<select id="redis">
									<option value="0">Disabled</option>
									<option value="EOD">EOD</option>
									<option value="custom">Custom<custom>
								</select>

								<input type="number" min="1" step="1" name="redis_custom" class="hidden" placeholder="Seconds">
							</label>

							<label>
								<span>Status</span>
								<select name="is_enabled" required>
									<option value="1">Enabled</option>
									<option value="0">Disabled</option>
								</select>
							</label>
						</div>

						<div class="form description">
							<span>Description</span>
						</div>
					</form>

					<h2>Share Report</h2>
					<div id="share-report"></div>
				</section>

				<section class="section" id="stage-define-report">

					<header class="toolbar">
						<div id="save-container">
							<button type="submit" form="define-report-form" class="save-define-report"><i class="far fa-save"></i> Save</button>
							<button id="save-more"><i class="fa fa-angle-down"></i></button>
							<div id="save-menu" class="hidden">
								<button id="fork"><i class="fas fa-code-branch"></i> Fork</button>
							</div>
						</div>
						<button id="schema-toggle" class="hidden"><i class="fas fa-database"></i> Schema</button>
						<button id="filters-toggle"><i class="fas fa-filter"></i> Filters</button>
						<button id="preview-toggle"><i class="fas fa-eye"></i> Preview</button>
						<button id="edit-data-toggle"><i class="fas fa-edit"></i> Edit Data</button>
						<button id="run"><i class="fas fa-sync"></i> Run</button>
						<button id="history-toggle"><i class="fa fa-history"></i> History</button>
					</header>

					<div id="define-report-parts">
						<div id="schema" class="hidden"></div>
						<form id="define-report-form"></form>
					</div>
				</section>

				<section class="section" id="stage-pick-visualization">

					<div id="visualization-list">

						<div class="toolbar">
							<button id="add-visualization" class="grey"><i class="fas fa-plus"></i> Add New Visualization</button></button>
						</div>

						<table>
							<thead>
								<tr>
									<th>Name</th>
									<th>Type</th>
									<th>Tags</th>
									<th class="action">Preview</th>
									<th class="action">Edit</th>
									<th class="action">Delete</th>
								</tr>
							</thead>
							<tbody></tbody>
						</table>
					</div>

					<div class="hidden" id="add-visualization-picker">

						<div class="toolbar">
							<button id="visualization-picker-back"><i class="fas fa-arrow-left"></i> Back</button>
						</div>

						<form id="add-visualization-form"></form>
					</div>

				</section>

				<section class="section" id="stage-configure-visualization">

					<div class="toolbar">
						<button type="button" id="configure-visualization-back"><i class="fa fa-arrow-left"></i> Back</button>
						<button type="submit" form="configure-visualization-form" class="right"><i class="far fa-save"></i> Save</button>
						<button type="button" id="preview-configure-visualization"><i class="fa fa-eye"></i> Preview</button>
						<button type="button" id="history-configure-visualization"><i class="fa fa-history"></i> History</button>
					</div>

				</section>
			</div>

			<div id="preview" class="hidden"></div>
		`;
	}
}));

router.get('/visualizations-manager/:id?', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/visualizations-manager.css');
		this.scripts.push('/js/reports.js');
		this.scripts.push('/js/visualizations-manager.js');
	}
}));

router.get('/users-manager/:id?', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/users-manager.css');
		this.scripts.push('/js/users-manager.js', '/js/reports.js');
	}

	async main() {
		return `
			<section class="section" id="list">

				<h1>Manage Users</h1>

				<header class="toolbar">
					<button id="add-user" class="grey"><i class="fa fa-plus"></i> Add New User</button>
				</header>

                <form class="user-search block form">

                    <label>
                        <span>Id</span>
                        <input type="number" name="user_id" step="1" min="0">
                    </label>

                    <label>
                        <span>Name</span>
                        <input type="text" name="name">
                    </label>

                    <label>
                        <span>Email</span>
                        <input type="text" name="email">
                    </label>

                    <label>
                        <span>Search by</span>
                        <select name="search_by" value="category">
                            <option value="category">Category</option>
                            <option value="role">Role</option>
                            <option value="privilege">Privilege</option>
                        </select>
                    </label>

                    <label class="category">
                        <span>Category</span>
                    </label>

                    <label class="hidden role">
                        <span>Role</span>
                    </label>

                    <label class="hidden privilege">
                        <span>Privilege</span>
                    </label>

                    <label>
                        <span>&nbsp;</span>
                        <button type="submit">Apply</button>
                    </label>
                </form>

				<table class="block">
					<thead>
						<tr class="search-bar"></tr>
						<tr class="thead-bar">
							<th data-key="id" class="thin">ID</th>
							<th data-key="name">Name</th>
							<th data-key="email">Email</th>
							<th data-key="lastLogin">Last Login</th>
							<th class="action">Edit</th>
							<th class="action">Delete</th>
						</tr>
					</thead>
					<tbody></tbody>
				</table>
			</section>

			<section class="section" id="form">

				<h1></h1>

				<header class="toolbar">
					<button id="cancel-form"><i class="fa fa-arrow-left"></i> Back</button>
					<button type="submit" form="user-form"><i class="far fa-save"></i> Save</button>
				</header>

				<form class="block form" id="user-form">

					<label>
						<span>Fist Name <span class="red">*</span></span>
						<input type="text" name="first_name" required>
					</label>

					<label>
						<span>Middle Name</span>
						<input type="text" name="middle_name">
					</label>

					<label>
						<span>Last Name</span>
						<input type="text" name="last_name">
					</label>

					<label>
						<span>Email <span class="red">*</span></span>
						<input type="email" name="email" required>
					</label>

					<label>
						<span>Password</span>
						<input type="password" name="password">
					</label>
				</form>

				<div class="privileges form-container">
					<h3>Privileges</h3>
					<form class="filter">
						<label><span>Category</span></label>
						<label><span>Privileges</span></label>
						<label class="edit"><span></span></label>
						<label class="save"><span></span></label>
					</form>

					<div id="filters-list"></div>

					<form id="add-filter" class="filter">

						<label>
							<select name="category_id"></select>
						</label>

						<label>
							<select name="privilege_id"></select>
						</label>

						<label class="save">
							<button type="submit" title="Add"><i class="fa fa-paper-plane"></i></button>
						</label>
					</form>
				</div>

				<h3>Roles</h3>

				<div class="roles form-container">
				</div>

			</section>
		`;
	}
}));

router.get('/connections-manager/:id?/:type?', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/connections-manager.css');
		this.scripts.push('/js/connections-manager.js', '/js/reports.js');
	}

	async main() {
		return `

			<section class="section" id="list">

				<h1 class="oauth-heading">OAuth Connections</h1>

				<div class="oauth-connections">

					<div class="test-result hidden"></div>

					<table class="block">
						<thead>
							<tr>
								<th class="thin">ID</th>
								<th>Name</th>
								<th>Type</th>
								<th class="action">Authenticate</th>
								<th class="action">Delete</th>
							</tr>
						</thead>
						<tbody></tbody>
					</table>

					<form id="add-oauth-connection" class="form">
						<select name="provider"></select>
						<button type="submit">
							<i class="fas fa-plus"></i> Add New Connection
						</button>
					</form>
				</div>

			</section>

			<section class="section" id="add-connection">

				<h1>Add New Connection</h1>

				<div id="add-connection-picker">

					<div class="toolbar">
						<button id="connection-picker-back"><i class="fas fa-arrow-left"></i> Back</button>
					</div>

					<form id="add-connection-form"></form>
				</div>
			</section>

			<section class="section" id="form">

				<h1></h1>

				<header class="toolbar">
					<button id="back"><i class="fa fa-arrow-left"></i> Back</button>
					<button type="submit" form="connections-form"><i class="far fa-save"></i> Save</button>
					<button type="button" id="test-connection"><i class="fas fa-flask"></i>Test</button>
				</header>

				<div class="test-result hidden"></div>

				<form class="block form" id="connections-form">

					<label>
						<span>Name <span class="red">*</span></span>
						<input type="text" name="connection_name" required>
					</label>

					<div id="details"></div>
				</form>

				<h2 class="share-heading">Share connections</h2>
				<div id="share-connections"></div>
			</section>
		`;
	}
}));

router.get('/settings/:tab?/:id?', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/settings.css', '/css/settings-manager.css', 'css/reports.css');

		this.scripts = this.scripts.concat([
			'/js/reports.js',
			'/js/settings.js',
			'/js/settings-manager.js',
			'https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.17/d3.min.js',
			'https://devpreview.tiny.cloud/demo/tinymce.min.js'
		]);
	}

	async main() {
		return `
			<nav></nav>

			<div class="setting-page accounts-page hidden">

				<section class="section" id="accounts-list">

					<h1>Manage Accounts</h1>

					<header class="toolbar">
						<button id="add-account"><i class="fa fa-plus"></i> Add New Account</button>
					</header>

					<table class="block">
						<thead>
							<th>Id</th>
							<th>Name</th>
							<th>URL</th>
							<th data-no-sort>Icon</th>
							<th data-no-sort>Logo</th>
							<th class="action">Edit</th>
							<th class="action">Delete</th>
						</thead>
						<tbody></tbody>
					</table>
				</section>

				<section class="section" id="accounts-form">

					<h1></h1>

					<header class="toolbar">
						<button id="cancel-form"><i class="fa fa-arrow-left"></i> Back</button>
						<button type="submit" form="account-form"><i class="far fa-save"></i> Save</button>
					</header>

					<form class="block form" id="account-form">

						<label>
							<span>Name <span class="red">*</span></span>
							<input type="text" name="name" required>
						</label>

						<label>
							<span>URL <span class="red">*</span></span>
							<input type="text" name="url" required>
						</label>

						<label>
							<span>Icon</span>
							<input type="url" name="icon">
							<img src="" alt="icon" id="icon" height="30">
						</label>

						<label>
							<span>Logo</span>
							<input type="url" name="logo">
							<img src="" alt="logo" id="logo" height="30">
						</label>

						<label>
							<span>Authentication API</span>
							<input type="url" name="auth_api">
						</label>
					</form>
				</section>
			</div>

			<div class="setting-page global-filters-page hidden">
				<section class="section" id="global-filters-list">

					<h1>Manage Global Filters</h1>

					<header class="toolbar">
						<button id="add-global-filter"><i class="fa fa-plus"></i> Add New Global Filter</button>
					</header>

					<table class="block">
						<thead>
							<tr>
								<th>ID</th>
								<th>Name</th>
								<th>Placeholder</th>
								<th>Type</th>
								<th>Order</th>
								<th>Dashboard</th>
								<th>Default Value</th>
								<th>Multiple</th>
								<th>Offset</th>
								<th>Dataset</th>
								<th class="action">Edit</th>
								<th class="action">Delete</th>
							</tr>
						</thead>
						<tbody></tbody>
					</table>
				</section>

				<section class="section" id="global-filters-form">

					<h1></h1>

					<header class="toolbar">
						<button id="cancel-form"><i class="fa fa-arrow-left"></i> Back</button>
						<button type="submit" form="user-form"><i class="far fa-save"></i> Save</button>
					</header>

					<form class="block form" id="user-form">

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

						<label class="dashboard-ids">
							<span>Dashboard <span class="right" data-tooltip="Dashboard specific Global Filter">?</span></span>
						</label>

						<label>
							<span>Description</span>
							<input type="text" name="description" maxlength="200">
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

						<label class="datasets">
							<span>Dataset <span class="right" data-tooltip="A set of possible values for this filter.">?</span></span>
						</label>

						<label>
							<span>Multiple <span class="right" data-tooltip="Can the user pick multiple values.">?</span></span>
							<select name="multiple">
								<option value="0">No</option>
								<option value="1">Yes</option>
							</select>
						</label>
					</form>
				</section>
			</div>

			<div class="setting-page documentation-page hidden"></div>

			<div class="setting-page privilege-page hidden">

				<section class="section" id="privileges-list">

					<h1>Manage Privileges</h1>

					<header class="toolbar">
						<button id="add-privilege"><i class="fa fa-plus"></i> Add New Privilege</button>
					</header>

					<table class="block">
						<thead>
							<tr>
								<th>ID</th>
								<th>Name</th>
								<th>Is Admin</th>
								<th class="action">Edit</th>
								<th class="action">Delete</th>
							</tr>
						</thead>
						<tbody></tbody>
					</table>
				</section>

				<section class="section" id="privileges-form">

					<h1></h1>

					<header class="toolbar">
						<button id="cancel-form"><i class="fa fa-arrow-left"></i> Back</button>
						<button type="submit" form="user-form2"><i class="far fa-save"></i> Save</button>
					</header>

					<form class="block form" id="user-form2">

						<label>
							<span>Name <span class="red">*</span></span>
							<input type="text" name="name" required>
						</label>

						<label>
							<span>Is Admin <span class="red">*</span></span>
							<select name="is_admin" required>
								<option value="1">Yes</option>
								<option value="0">No</option>
							</select>
						</label>
					</form>
				</section>
			</div>

			<div class="setting-page roles-page hidden">

				<section class="section" id="roles-list">

					<h1>Manage Roles</h1>

					<header class="toolbar">
						<button id="add-role"><i class="fa fa-plus"></i> Add New Role</button>
					</header>

					<table class="block">
						<thead>
							<tr>
								<th class="thin">ID</th>
								<th>Name</th>
								<th>Admin</th>
								<th class="action">Edit</th>
								<th class="action">Delete</th>
							</tr>
						</thead>
						<tbody></tbody>
					</table>
				</section>

				<section class="section" id="roles-form">

					<h1></h1>

					<header class="toolbar">
						<button id="back"><i class="fa fa-arrow-left"></i> Back</button>
						<button type="submit" form="role-form"><i class="far fa-save"></i> Save</button>
					</header>

					<form class="block form" id="role-form">

						<label>
							<span>Name <span class="red">*</span></span>
							<input type="text" name="name" required>
						</label>

						<label>
							<span>Admin <span class="red">*</span></span>
							<select  name="is_admin" required>
								<option value="1">Yes</option>
								<option value="0">No</option>
							</select>
						</label>
					</form>
				</section>
			</div>

			<div class="setting-page category-page hidden">

				<section class="section" id="category-list">

					<h1>Manage Categories</h1>

					<header class="toolbar">
						<button id="add-category"><i class="fa fa-plus"></i> Add New Category</button>
					</header>

					<table class="block">
						<thead>
							<tr>
								<th class="thin">ID</th>
								<th>Name</th>
								<th>Slug</th>
								<th>Parent</th>
								<th>Admin</th>
								<th class="action">Edit</th>
								<th class="action">Delete</th>
							</tr>
						</thead>
						<tbody></tbody>
					</table>
				</section>

				<section class="section" id="category-edit">

					<h1></h1>

					<header class="toolbar">
						<button id="back"><i class="fa fa-arrow-left"></i> Back</button>
						<button type="submit" form="category-form"><i class="far fa-save"></i> Save</button>
					</header>

					<form class="block form" id="category-form">

						<label>
							<span>Name <span class="red">*</span></span>
							<input type="text" name="name" required>
						</label>

						<label>
							<span>Slug <span class="red">*</span></span>
							<input type="text" name="slug" required>
						</label>

						<label>
							<span>Parent</span>
							<input type="number" name="parent">
						</label>

						<label>
							<span>Admin <span class="red">*</span></span>
							<select name="is_admin" required>
								<option value="1">Yes</option>
								<option value="0">No</option>
							</select>
						</label>
					</form>
				</section>
			</div>

			<div class="setting-page about-page hidden">
				<section class="section about-list" id="about"></section>
			</div>
		`;
	}
}));

router.get('/tasks/:id?/:define?', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/tasks.css');
		this.scripts.push('/js/tasks.js');
	}

	main() {

		return `
			<section class="section" id="list">
				<h1>Tasks</h1>

				<header class="toolbar">
					<button id="add-task"><i class="fas fa-plus"></i> Add New Task</button>
				</header>

				<table class="block">
					<thead>
						<tr>
							<th>ID</th>
							<th>Name</th>
							<th>Type</th>
							<th class="action">Define</th>
							<th class="action">Edit</th>
							<th class="action">Delete</th>
						</tr>
					</thead>
					<tbody></tbody>
				</table>
			</section>

			<section class="section" id="form">

				<h1></h1>

				<header class="toolbar">
					<button id="form-back"><i class="fas fa-arrow-left"></i> Back</button>
					<button type="submit" form="task-form"><i class="far fa-save"></i> Save</button>
				</header>

				<form class="form block" id="task-form">

					<label>
						<span>Task Name</span>
						<input type="text" name="name" required>
					</label>

					<label>
						<span>Task Type</span>
						<select name="type" required>
							<option value="google-analytics">Google Analytics</option>
						</select>
					</label>
				</form>
			</section>

			<section class="section" id="define">

				<header class="toolbar">
					<button id="define-back"><i class="fas fa-arrow-left"></i> Back</button>
					<button type="submit" form="task-define"><i class="far fa-save"></i> Save</button>
				</header>
			</section>
		`;
	}
}));

router.get('/documentation/:id?', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/documentation/documentation-browser.css');
		this.scripts.push('/js/documentation/documentation-browser.js');
	}
}));

router.get('/tests', API.serve(class extends HTMLAPI {

	constructor() {

		super();

		this.stylesheets.push('/css/tests.css');

		this.scripts = this.scripts.concat([

			'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/markerclusterer.js" defer f="',
			'https://maps.googleapis.com/maps/api/js?key=AIzaSyA_9kKMQ_SDahk1mCM0934lTsItV0quysU&libraries=visualization" defer f="',

			'https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.17/d3.min.js',

			'/js/reports.js',
			'/js/user/profile.js',
			'/js/settings-manager.js',
			'/js/tests.js',
		]);
	}

	main() {

		if(!this.user || this.environment.name.includes('production') || this.environment.name.includes('staging'))
			throw new API.Exception(401, 'Tests cannot run on production database');

		this.user.privilege.needs('superadmin');

		return `

			<section class="section" id="list">

				<h1>Tests</h1>

				<header class="toolbar">
					<button id="run"><i class="fas fa-check"></i> Run</button>

					<div id="progress">
						<meter min="0"></meter>
						<span class="NA"></span>
					</div>
				</header>

				<div id="tests"></div>
			</section>
		`;
	}
}));

module.exports = router;