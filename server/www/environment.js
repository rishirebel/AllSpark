const API = require('../utils/api');
const fetch = require('node-fetch');
const config = require('config');
const commonFun = require('../utils/commonFunctions');
const HeadlessChrome = require('../utils/headless-chrome');
const {performance} = require('perf_hooks');
const redis = require('../utils/redis').Redis;

class About extends API {

	async about() {

		let response = {
			...this.environment,
			services: {}
		};

		const functionMap = {
			mysql: "testMysql",
			python: "testPython",
			chrome: "testHeadlessChrome",
			redis: "testRedis"
		};

		for(const key in functionMap) {

			const start = performance.now();

			try {
				const funResponse = await this[functionMap[key]]();

				response.services[key] = {
					status: true,
					time: parseFloat(performance.now() - start).toFixed(2).concat('ms'),
					message: '',
					...funResponse
				}
			}
			catch(e) {

				response.services[key] = {
					status: false,
					time: parseFloat(performance.now() - start).toFixed(2).concat('ms'),
					message: e.message
				}
			}
		}

		return response;
	}

	async testMysql() {

		await this.mysql.query('SELECT 1');
		return {};
	}

	async testPython() {

		let response = await fetch(config.get('allspark_python_base_api'));

		response = await response.json();

		if(commonFun.isJson(response.response)) {

			response.response = JSON.parse(response.response)
		}

		return {
			port: response.response.port
		}
	}

	async testHeadlessChrome() {

		const headlessChrome = new HeadlessChrome();

		await headlessChrome.setup();
		await headlessChrome.browser.close();

		return {};
	}

	async testRedis() {

		await redis.set(`key${this.environment.name}`, 1);

		if(await redis.get(`key${this.environment.name}`) != 1) {

			throw new API.Exception(500, 'Error in setting redis key.');
		}

		await redis.del(`key${this.environment.name}`);

		return {};
	}
}

exports.about = About;