const config = require('config');
const promisify = require("util").promisify;
const child_process = require('child_process');

if (!config.has('redisOptions')) {
	return;
}

const redis = require('redis');
const redisOptions = config.get("redisOptions");

const redis_client = redis.createClient(redisOptions);


class Redis {

	constructor() {

		console.log("initializing redis");

		Redis.redis_client = redis_client;
	}

	static options() {

		return redisOptions;
	}

	static async get(keyPattern) {

		const getPromisified = promisify(redis_client.get).bind(redis_client);
		// console.log("getting key: ", keyPattern);

		return await getPromisified(keyPattern);
	}

	static async keys(keyPattern) {

		const keysPromisified = promisify(redis_client.keys).bind(redis_client);
		console.log("getting list of keys like:", keyPattern);

		return await keysPromisified(keyPattern);
	}

	static async set(key, value) {

		const setPromisified = promisify(redis_client.set).bind(redis_client);
		// console.log("string in redis key:", key);

		return await setPromisified(key, value);
	}

	static async expire(key, seconds) {

		const expirePromisified = promisify(redis_client.expire).bind(redis_client);
		console.log("setting expiration of key", key, "for", seconds, "seconds");

		return await expirePromisified(key, seconds);
	}

	static async expireat(key, expireUnixTimestampSeconds) {

		const expireatPromisified = promisify(redis_client.expireat).bind(redis_client);
		console.log("setting expire unixtimestamp for", key);

		return await expireatPromisified(key, expireUnixTimestampSeconds);
	}

	static async del(key) {

		const deletePromisified = promisify(redis_client.del).bind(redis_client);
		console.log("deleting key", key);

		return await deletePromisified(key);
	}

	static async hset(key, field, value) {

		const hsetPromisified = promisify(redis_client.hset).bind(redis_client);
		console.log("hset key: field", key, " : ", field);

		return await hsetPromisified(key, field, value);
	}

	static async hget(key, field) {

		const hgetPromisified = promisify(redis_client.hget).bind(redis_client);

		return await hgetPromisified(key, field);
	}

	static async keyInfo(key) {

		const keyResponse = child_process.execSync(`redis-cli debug object ${key}`).toString().trim();
		return parseFloat(keyResponse.slice(keyResponse.indexOf('serializedlength') + 17));
	}
}

exports.redis = redis_client;
exports.Redis = Redis;
