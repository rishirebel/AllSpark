const API = require('../utils/api');
const fetch = require('node-fetch');
const config = require('config');
const commonFun = require('../utils/commonFunctions');
const HeadlessChrome = require('../utils/headless-chrome');
const {performance} = require('perf_hooks');
const redis = require('../utils/redis').Redis;

class About extends API {

	async about() {

		let
			mysqlResponse = {
				status: false,
				time: 0
			},
			pythonResponse = {
				status: false,
				port: null
			},
			chromeResponse = {status: false},
			redisResponse = {status: false}
		;

		try {

			const start = performance.now();

			await this.mysql.query('SELECT 1');

			mysqlResponse = {
				status:true,
				time:  parseFloat(performance.now() - start).toFixed(2)
			}
		}
		catch(e) {

			mysqlResponse.message = e.message;
		}

		if(!config.has("allspark_python_base_api")) {

			pythonResponse.message = 'Python base api not set in config.';
		}
		else {

			try {

				let response = await fetch(config.get('allspark_python_base_api'));

				response = await response.json();

				if(commonFun.isJson(response.response)) {

					response.response = JSON.parse(response.response)
				}

				pythonResponse = {
					status: true,
					port: response.response.port
				}
			}
			catch(e) {

				pythonResponse.message = e.message;
			}
		}

		try {

			const headlessChrome = new HeadlessChrome();

			await headlessChrome.setup();
			await headlessChrome.browser.close();

			chromeResponse.status = true
		}
		catch(e) {

			chromeResponse.message = e.message;
		}

		try {

			await redis.set(`key${this.environment.name}`, 1);

			if(await redis.get(`key${this.environment.name}`) == 1) {

				redisResponse.status = true;
			}

			await redis.del(`key${this.environment.name}`);
		}
		catch(e) {

			redisResponse.message = e.message;
		}

		return {
			...this.environment,
			services: {
				mysql: mysqlResponse,
				python: pythonResponse,
				chrome: chromeResponse,
				redis: redisResponse
			}
		};
	}
}

exports.about = About;