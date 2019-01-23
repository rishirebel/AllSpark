exports.saltrounds = 10;

exports.adminAccount = [0];

exports.adminCategory = [0];

exports.adminRole = [0];

exports.adminPrivilege = [0];

exports.privilege = {
	administrator: "Everything",
	user: "user",
	"user.insert": "user.insert",
	"user.update": "user.update",
	"user.delete": "user.delete",
	"user.list": "user.list",
	connection: "connection",
	"connection.insert": "connection.insert",
	"connection.update": "connection.update",
	"connection.delete": "connection.delete",
	"connection.list": "connection.list",
	"dashboard.insert": "dashboard.insert",
	"dashboard.update": "dashboard.update",
	"dashboard.delete": "dashboard.delete",
	"report.insert": "report.insert",
	"report.update": "report.update",
	"report.delete": "report.delete",
	superadmin: "superadmin",
	ignore_category: ["connection.list","category.list", "visualization.list"],
	ignore_privilege: ["dashboard.list", "visualization.list", "connection.list", "category.list"],
	"visualization.insert": "visualization.insert",
	"visualization.update": "visualization.update",
	"visualization.delete": "visualization.delete",
	"visualization.list": "visualization.list",
	"category.list": "category.list",
	"category.update":"category.update",
	"category.insert": "category.insert",
	"category.delete": "category.delete"
};

exports.publicEndpoints = [
	'/v2/accounts/get',
	'/v2/authentication/login',
	'/v2/authentication/refresh',
	'/v2/authentication/reset',
	'/v2/authentication/resetLink',
	'/v2/scope/scopeAuth',
	'/v2/accounts/signup',
	'/v2/oauth/connections/redirect_uri',
	'/v2/session-logs/insert',
	'/v2/tests/test',
	'/v2/scheduler/jobs/run',
];

exports.nonAccountEndpoints = [
	'/v2/setup/run',
	'/v2/environment/about'
]

exports.filterPrefix = "param_";

exports.external_parameter_prefix = "ext_";

exports.saveQueryResultDb = "save_history";

exports.saveQueryResultTable = "tb_save_history";

exports.filterTypes = [
	{
		name: 'Number',
		input_type: 'number',
	},
	{
		name: 'Text',
		input_type: 'text',
	},
	{
		name: 'Date',
		input_type: 'date',
	},
	{
		name: 'Month',
		input_type: 'month',
	},
	{
		name: 'Year',
		input_type: 'number',
	},
	{
		name: 'DateTime',
		input_type: 'datetime-local',
	},
	{
		name: 'Time',
		input_type: 'time',
	},
	{
		name: 'Hidden',
		input_type: 'hidden',
	},
	{
		name: 'Column',
		input_type: 'text',
	},
	{
		name: 'DateRange',
		input_type: '',
	},
	{
		name: 'Literal',
		input_type: 'text',
	},
];

exports.lastUpdatedKeys = {
	connection: 'connection',
	account: 'account',
};