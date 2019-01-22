const API = require('../utils/api');
const fetch = require('node-fetch');
const config = require('config');
const commonFunc = require('../utils/commonFunctions');
const HeadlessChrome = require('../utils/headless-chrome');
const {performance} = require('perf_hooks');

class About extends API {

	async about() {

		let
			mysqlResponse = {
				status: false,
				time: 0
			},
			pythonResponse = {
				status:false,
				port: null
			},
			chromeResponse = {status:false}
		;

		try {

			const start = performance.now();

			await this.mysql.query('SELECT 1');

			mysqlResponse = {
				status:true,
				time:  parseFloat(performance.now() - start).toFixed(2)
			}
		}
		catch(e) {}

		try {

			let response = await fetch(config.get("allspark_python_base_api"));

			response = await response.json();

			if(commonFunc.isJson(response.response)) {

				response.response = JSON.parse(response.response)
			}

			pythonResponse = {
				status: true,
				port: response.response.port
			}
		}
		catch(e) {}

		try {

			const headlessChrome = new HeadlessChrome();

			await headlessChrome.setup();
			await headlessChrome.browser.close();

			chromeResponse = {
				status: true
			}
		}
		catch(e) {}

		return {
			...this.environment,
			services: {
				mysql: mysqlResponse,
				python: pythonResponse,
				chrome: chromeResponse
			}
		};
	}
}

exports.about = About;