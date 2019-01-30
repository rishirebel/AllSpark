const express = require('express');
const router = express.Router();

const api = require('../utils/api');
const account = require('../onServerStart');
const mysql = require("../utils/mysql");
const mssql = require("../utils/mssql");
const postgres = require("../utils/pgsql");
const mongo = require("../utils/mongo");
const oracle = require("../utils/oracle");
let syncServer = require("../utils/sync-server");
const config = require('config');
const MySQL = require('mysql');

(async () => {

	syncServer = new syncServer();

	const
		connectionObj = {
			host: config.get('sql_db').write.host,
			user: config.get('sql_db').write.user,
			password: config.get('sql_db').write.password
		},
		conn = MySQL.createConnection(connectionObj),
		useDb = await new Promise((resolve, reject) => {

			conn.connect((err) => {

				if (err) resolve({'error': true});

				return conn.query('USE ??', [config.get('sql_db').write.database], (err, result) => {

					if (err) return resolve({'error': true});

					return resolve(result);
				});
			});
		});

	if(useDb.error) {

		return console.error('Unable to establish MySQL connection.');
	}

	await account.loadAccounts();
	await account.loadBigquery();
	account.executingQueriesMap();
	await api.setup();
	await mysql.crateExternalPool();
	await mssql.crateExternalPool();
	await postgres.crateExternalPool();
	await mongo.crateExternalPool();
	await oracle.crateExternalPool();
})();


router.use(function (req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
	next();
});


/* GET home page. */
router.get('/', function (req, res, next) {
	res.render('index', {title: 'Exprexxo'});
});

router.get('/hello', function (req, res, next) {
	res.render('index', {title: 'hello'});
});


router.get('/v2/*', api.serve());
router.post('/v2/*', api.serve());


module.exports = router;
