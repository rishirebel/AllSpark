var express = require('express');
var router = express.Router();

var newApi = require('../utils/newApi');
var account = require('../onServerStart');
var engine = require('../www/reports/engine');
//var bigquery = require("../www/bigquery").setup;

(async () => {

    await account.loadAccounts();
    await account.loadBigquery();
    await newApi.setup();

})();



var report = require("../www/reports/report");

router.use(function(req, res, next){
    res.header("Access-Control-Allow-Origin", "*");
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    next();
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Exprexxo' });
});
router.get('/hello', function(req, res, next) {
    res.render('index', { title: 'hello' });
});


router.get('/v2/*', newApi.serve());
router.post('/v2/*', newApi.serve());

router.get("/test", report.test);
module.exports = router;
