const bcrypt = require('bcryptjs');
const constants = require('./constants');
const jwt = require('jsonwebtoken');
const config = require('config');
const fs = require('fs');
const path = require('path');
const promisify = require('util').promisify;
const jwtVerifyAsync = promisify(jwt.verify, jwt);
const atob = require('atob');


function promiseParallelLimit(limit, funcs) {
	const batches = [];
	for (let e = 0; e < Math.ceil(funcs.length / limit); e++)
		batches.push(funcs.slice(e * limit, (e + 1) * limit))
	return batches.reduce((promise, batch) =>
			promise.then(result =>
				Promise.all(batch).then(Array.prototype.concat.bind(result))),
		Promise.resolve([]));
}

function isJson(str) {
	try {
		JSON.parse(str);
	} catch (e) {
		return false;
	}
	return true;
}


async function makeBcryptHash(pass) {

	return await bcrypt.hash(pass, constants.saltrounds);
}


async function verifyBcryptHash(pass, hash) {

	return await bcrypt.compare(pass, hash)
}

function makeJWT(obj, expiresIn = Math.floor(Date.now() / 1000) + (30 * 86400)) {

	obj = {
		data: encodeURIComponent(JSON.stringify(obj)),
	};

	if (expiresIn) {

		obj.exp = expiresIn;
	}

	return jwt.sign(obj, config.get('secret_key'));

}


async function verifyJWT(token) {

	// if(config.has("role_ignore") && config.has("privilege_ignore")) {
	//
	// 	if(config.get("role_ignore") && config.get("privilege_ignore")) {
	//
	// 		return JSON.parse(decodeURIComponent(atob(token.split(".")[1])));
	// 	}
	// }
	try {

		let verifiedToken = (await (jwtVerifyAsync(token, config.get('secret_key'))));

		if(!verifiedToken.data) {

			throw Error('Error in JWT');
		}

		verifiedToken = {
			...JSON.parse(decodeURIComponent(verifiedToken.data)),
			iat: verifiedToken.iat,
			exp: verifiedToken.exp,
		};

		return verifiedToken;

	}
	catch (e) {

		return {
			error: true,
			message: e.message
		}
	}
}

async function getUserDetailsJWT(token) {

	const details = await verifyJWT(token);

	if (!details.error) {
		return details;
	}

	if (details.error && details.message != 'jwt expired') {
		return details;
	}

	let token_details = [];

	try {
		token_details = JSON.parse(decodeURIComponent(atob(token.split('.')[1])));
	}
	catch (e) {
	}

	return token_details;
}

function clearDirectory(directory) {

	const files = fs.readdirSync(directory);

	for (const file of files) {
		fs.unlinkSync(path.join(directory, file))
	}
}


function listOfArrayToMatrix(l) {
	const indices = [];

	l.map(x => indices.push(0));

	const n = l.length;

	const solution = [];

	while (1) {

		const temp = [];

		for (let i = 0; i < indices.length; i += 1) {
			temp.push(l[i][indices[i]]);
		}

		solution.push(temp);

		let next = n - 1;

		while (next >= 0 && indices[next] + 1 >= l[next].length) {
			next -= 1;
		}

		if (next < 0) {
			return solution
		}

		indices[next] += 1;

		for (let i = next + 1; i < n; i += 1) {
			indices[i] = 0
		}
	}
}


function authenticatePrivileges(userPrivileges, objectPrivileges) {

	//userPrivileges , objectPrivileges = [[1,2,3], [4,5,6]]

	// console.log(objectPrivileges);
	// console.log(userPrivileges);


	const solutions = [];
	objectPrivileges.map(x => solutions.push(false));

	const account = 0, category = 1, role = 2;

	//userPrivileges = [[8, 0, 7]];

	for (let objectPrivilege = 0; objectPrivilege < objectPrivileges.length; objectPrivilege++) {

		for (let userPrivilege = 0; userPrivilege < userPrivileges.length; userPrivilege++) {

			const accountFlag = objectPrivileges[objectPrivilege][account] === userPrivileges[userPrivilege][account] ||
				constants.adminAccount.includes(userPrivileges[userPrivilege][account]);

			const categoryFlag = objectPrivileges[objectPrivilege][category] === userPrivileges[userPrivilege][category] ||
				constants.adminCategory.includes(userPrivileges[userPrivilege][category]);

			const roleFlag = objectPrivileges[objectPrivilege][role] === userPrivileges[userPrivilege][role] ||
				constants.adminRole.includes(userPrivileges[userPrivilege][role]);


			const fullHouse = accountFlag && categoryFlag && roleFlag;

			if (fullHouse) {

				solutions[objectPrivilege] = true;
			}
		}

	}
	// console.log(solutions);
	// console.log(objectPrivileges)
	// console.log(userPrivileges)
	for (const result of solutions) {
		if (!result) {
			return {
				error: true,
				message: "User not authorised!",
				reason: "full house"
			};
		}
	}

	return {
		error: false,
		message: "privileged user!",
	};
}


function getIndicesOf(searchStr, str, caseSensitive = 1) {

	// searchStr = needle, str = haystack

	let searchStrLen = searchStr.length;

	if (searchStrLen === 0) {

		return [];
	}

	let indices = [];


	if (!caseSensitive) {

		str = str.toLowerCase();
		searchStr = searchStr.toLowerCase();
	}

	let re = new RegExp(searchStr, "g");
	let match;

	while (match = re.exec(str)) {

		indices.push(match.index);
	}

	return indices;
}


function flattenObject(init, lkey = '') {

	let ret = {};

	for (const rkey in init) {

		const val = init[rkey];

		if (Array.isArray(val)) {

			ret[lkey + rkey] = (val.map(x => JSON.stringify(x))).join();
		}

		else if (val && val.__proto__.constructor.name === 'Object') {

			Object.assign(ret, flattenObject(val, lkey + rkey + '_'));
		}

		else {

			ret[lkey + rkey] = val;
		}
	}

	return ret;
}

class UserAgent {

	constructor(userAgent) {

		this.userAgent = userAgent.toLowerCase();
	}

	get os() {

		if (this.userAgent.includes('linux')) {

			return 'linux';
		}

		else if (this.userAgent.includes('macintosh')) {

			return 'macintosh';
		}

		else if (this.userAgent.includes('windows')) {

			return 'windows';
		}

		else {

			return 'others';
		}
	}

	get browser() {

		if (this.userAgent.includes('chrome')) {

			return 'chrome';
		}

		else if (this.userAgent.includes('firefox')) {

			return 'firefox';
		}

		else if (this.userAgent.includes('safari') && !this.userAgent.includes('chrome')) {

			return 'safari';
		}

		else {

			return 'others';
		}
	}
}

function promiseTimeout(promise, seconds, rejectPromise = () => Promise.resolve()) {

	return new Promise(function (resolve, reject) {

		let timer = setTimeout(() => {

			if (rejectPromise) {

				rejectPromise();
			}

			reject(new Error("timeout"));
		}, seconds * 1000);

		promise
			.then(res => {
				clearTimeout(timer);
				resolve(res);
			})
			.catch(err => {
				clearTimeout(timer);
				reject(err);
			});
	});
}

exports.UserAgent = UserAgent;
exports.isJson = isJson;
exports.makeBcryptHash = makeBcryptHash;
exports.verifyBcryptHash = verifyBcryptHash;
exports.makeJWT = makeJWT;
exports.verifyJWT = verifyJWT;
exports.getUserDetailsJWT = getUserDetailsJWT;
exports.clearDirectory = clearDirectory;
exports.listOfArrayToMatrix = listOfArrayToMatrix;
exports.authenticatePrivileges = authenticatePrivileges;
exports.promiseParallelLimit = promiseParallelLimit;
exports.getIndicesOf = getIndicesOf;
exports.flattenObject = flattenObject;
exports.promiseTimeout = promiseTimeout;