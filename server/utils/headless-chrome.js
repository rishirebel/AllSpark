const puppeteer = require('puppeteer');

class HeadlessChrome {

	async setup() {

		this.browser = HeadlessChrome.browser = await puppeteer.launch({
			headless: true,
			args: ['--window-size=1920,1080', '--no-sandbox'],
		});
	}
}

module.exports = HeadlessChrome;