CREATE TABLE `tb_account_features` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `account_id` int(11) NOT NULL,
  `feature_id` int(11) NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_id` (`account_id`,`feature_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_accounts` (
  `account_id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(30) NOT NULL DEFAULT '',
  `url` varchar(500) NOT NULL DEFAULT '',
  `icon` varchar(500) DEFAULT NULL,
  `logo` varchar(500) DEFAULT NULL,
  `auth_api` varchar(300) DEFAULT NULL,
  `status` int(11) NOT NULL DEFAULT '1',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_categories` (
  `category_id` int(11) NOT NULL AUTO_INCREMENT,
  `account_id` int(11) DEFAULT NULL,
  `name` varchar(32) NOT NULL,
  `slug` varchar(32) NOT NULL,
  `parent` int(11) DEFAULT NULL,
  `is_admin` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `account_slug` (`account_id`,`slug`),
  KEY `parent` (`parent`),
  KEY `slug` (`slug`,`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_credentials` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `account_id` int(11) NOT NULL,
  `type` varchar(50) NOT NULL,
  `connection_name` varchar(50) DEFAULT NULL,
  `host` varchar(100) DEFAULT NULL,
  `port` int(11) DEFAULT NULL,
  `user` varchar(100) DEFAULT NULL,
  `password` varchar(100) DEFAULT NULL,
  `db` varchar(100) DEFAULT NULL,
  `limit` int(11) DEFAULT NULL,
  `file` text,
  `project_name` varchar(50) DEFAULT NULL,
  `status` int(11) NOT NULL DEFAULT '1',
  `added_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_id` (`account_id`,`connection_name`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_dashboards` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `account_id` int(11) NOT NULL,
  `added_by` int(11) DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `parent` int(11) DEFAULT NULL,
  `icon` varchar(100) DEFAULT NULL,
  `status` smallint(6) NOT NULL DEFAULT '1',
  `roles` varchar(50) DEFAULT NULL,
  `order` int(11) DEFAULT NULL,
  `format` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_datasources` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL DEFAULT '',
  `slug` varchar(50) NOT NULL DEFAULT '',
  `image` varchar(500) DEFAULT NULL,
  `status` int(11) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_features` (
  `feature_id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `slug` varchar(50) NOT NULL,
  `type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`feature_id`),
  UNIQUE KEY `slug` (`slug`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_global_filters` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) DEFAULT NULL,
  `account_id` int(11) DEFAULT NULL,
  `placeholder` varchar(64) NOT NULL DEFAULT '' COMMENT '{{ backend }} , [[ frontend ]]',
  `description` varchar(200) DEFAULT NULL,
  `dashboard_id` int(11) DEFAULT NULL,
  `order` int(11) DEFAULT NULL,
  `default_value` varchar(500) DEFAULT NULL COMMENT 'default not null to apply filter',
  `offset` int(11) DEFAULT NULL,
  `multiple` smallint(6) DEFAULT '0',
  `type` enum('number','text','date','month','hidden','column','datetime') DEFAULT 'text' COMMENT '0-Integer, 1-String, 2-Date',
  `dataset` int(11) DEFAULT NULL,
  `is_enabled` int(11) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_index` (`account_id`,`placeholder`,`dashboard_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_job_contacts` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `job_id` int(11) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `job_status` int(11) DEFAULT NULL,
  `contact_type` varchar(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_jobs` (
  `job_id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `account_id` int(11) DEFAULT NULL,
  `name` varchar(50) DEFAULT NULL,
  `cron_interval_string` varchar(50) DEFAULT NULL,
  `next_interval` timestamp NULL DEFAULT NULL,
  `is_enabled` int(11) NOT NULL DEFAULT '1',
  `is_deleted` int(11) NOT NULL DEFAULT '0',
  `added_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `type` enum('none','adword') DEFAULT 'none',
  `config` text,
  PRIMARY KEY (`job_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_oauth_connections` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `provider_id` int(11) NOT NULL,
  `access_token` varchar(1000) DEFAULT NULL,
  `refresh_token` varchar(1000) DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `status` tinyint(4) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_oauth_providers` (
  `provider_id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `type` varchar(100) NOT NULL,
  `client_id` varchar(1000) NOT NULL,
  `client_secret` varchar(1000) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`provider_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_object_roles` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `account_id` int(11) DEFAULT NULL,
  `added_by` int(11) DEFAULT NULL COMMENT 'User Id',
  `owner_id` int(11) NOT NULL COMMENT 'from',
  `owner` enum('user','dashboard','role','query','connection','visualization') DEFAULT NULL,
  `target_id` int(11) NOT NULL,
  `target` enum('user','dashboard','role','connection') NOT NULL DEFAULT 'role' COMMENT 'to',
  `category_id` int(11) DEFAULT NULL,
  `group_id` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_owner_target_cat_group` (`account_id`,`owner_id`,`owner`,`target_id`,`target`,`category_id`,`group_id`),
  KEY `account_id` (`account_id`),
  KEY `owner_id` (`owner_id`),
  KEY `owner` (`owner`),
  KEY `target` (`target`),
  KEY `target_id` (`target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_password_reset` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `reset_token` varchar(300) NOT NULL DEFAULT '',
  `status` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_privileges` (
  `privilege_id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `account_id` int(11) DEFAULT NULL,
  `is_admin` smallint(10) NOT NULL DEFAULT '0',
  `status` int(11) NOT NULL DEFAULT '1',
  `added_by` int(11) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`privilege_id`),
  UNIQUE KEY `name` (`name`,`account_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_privileges_tree` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `privilege_id` int(11) DEFAULT NULL,
  `parent` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `AccId_name_priviIedge_Parent` (`privilege_id`,`parent`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_query` (
  `query_id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `account_id` int(11) DEFAULT NULL,
  `name` varchar(64) NOT NULL,
  `connection_name` int(11) DEFAULT NULL,
  `query` mediumtext,
  `definition` json DEFAULT NULL,
  `url` varchar(500) DEFAULT NULL,
  `url_options` json DEFAULT NULL,
  `subtitle` int(11) NOT NULL COMMENT 'FK',
  `description` text,
  `added_by` int(100) DEFAULT NULL,
  `requested_by` varchar(100) DEFAULT NULL,
  `tags` varchar(1024) DEFAULT NULL,
  `is_enabled` int(11) NOT NULL DEFAULT '1',
  `is_deleted` int(11) NOT NULL DEFAULT '0',
  `is_redis` varchar(10) DEFAULT NULL,
  `load_saved` int(3) NOT NULL DEFAULT '0',
  `refresh_rate` int(11) DEFAULT NULL,
  `roles` varchar(50) DEFAULT NULL,
  `format` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`query_id`),
  KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_query_filters` (
  `filter_id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) DEFAULT NULL,
  `query_id` int(11) DEFAULT NULL,
  `placeholder` varchar(64) NOT NULL COMMENT '{{ backend }} , [[ frontend ]]',
  `description` varchar(64) DEFAULT NULL,
  `order` int(11) DEFAULT NULL,
  `default_value` varchar(500) DEFAULT '' COMMENT 'default not null to apply filter',
  `offset` varchar(500) DEFAULT NULL,
  `multiple` smallint(6) DEFAULT '0',
  `type` enum('number','text','date','month','hidden','column','datetime','literal','time','year') DEFAULT 'text',
  `dataset` int(11) DEFAULT NULL,
  `is_enabled` int(11) NOT NULL DEFAULT '1',
  `is_deleted` int(11) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`filter_id`),
  UNIQUE KEY `unique_index` (`query_id`,`placeholder`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_query_visualizations` (
  `visualization_id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `query_id` int(11) NOT NULL,
  `name` varchar(250) DEFAULT NULL,
  `type` enum('table','spatialmap','funnel','cohort','line','bar','area','pie','stacked','livenumber','dualaxisbar','bigtext','scatter','bubble','html','linear','sankey','calendar') NOT NULL DEFAULT 'table',
  `description` text,
  `tags` varchar(1024) DEFAULT NULL,
  `options` json DEFAULT NULL,
  `added_by` int(11) DEFAULT NULL,
  `is_enabled` tinyint(4) NOT NULL DEFAULT '1',
  `is_deleted` smallint(11) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`visualization_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_roles` (
  `role_id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `account_id` int(11) DEFAULT NULL,
  `name` varchar(30) DEFAULT NULL,
  `is_admin` smallint(6) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_settings` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `account_id` int(11) DEFAULT NULL,
  `owner` enum('account','user') DEFAULT NULL,
  `owner_id` int(11) DEFAULT NULL,
  `profile` varchar(30) DEFAULT NULL,
  `value` json DEFAULT NULL,
  `status` int(11) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_id` (`account_id`,`owner`,`profile`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_spatial_map_themes` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `theme` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `tb_tasks` (
  `task_id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `job_id` int(11) NOT NULL,
  `name` varchar(50) DEFAULT NULL,
  `account_id` int(11) NOT NULL,
  `definition` text COMMENT 'json containing url and method',
  `parameters` varchar(200) DEFAULT NULL,
  `timeout` float DEFAULT NULL COMMENT 'seconds',
  `sequence` int(11) NOT NULL,
  `inherit_data` smallint(6) DEFAULT NULL,
  `fatal` int(11) NOT NULL DEFAULT '0',
  `is_enabled` smallint(11) NOT NULL DEFAULT '1',
  `is_deleted` smallint(11) NOT NULL DEFAULT '0',
  `added_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_user_privilege` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `category_id` int(11) DEFAULT NULL,
  `privilege_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_category_privilege` (`user_id`,`category_id`,`privilege_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_user_query` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `query_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_users` (
  `user_id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `account_id` int(11) NOT NULL,
  `phone` varchar(15) DEFAULT '',
  `email` varchar(50) NOT NULL DEFAULT '',
  `first_name` varchar(30) NOT NULL DEFAULT '',
  `last_name` varchar(30) DEFAULT NULL,
  `middle_name` varchar(30) DEFAULT NULL,
  `privileges_deleted` varchar(50) DEFAULT NULL,
  `TTL` int(11) NOT NULL DEFAULT '30',
  `password` varchar(300) DEFAULT NULL,
  `added_by` int(11) DEFAULT '0',
  `status` varchar(30) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `account_user` (`email`,`account_id`),
  KEY `account_id` (`account_id`),
  KEY `phone` (`phone`),
  KEY `status` (`status`),
  KEY `created_aat` (`created_at`),
  KEY `first_name` (`first_name`,`middle_name`,`last_name`),
  KEY `first_name_2` (`first_name`),
  KEY `middle_name` (`middle_name`),
  KEY `last_name` (`last_name`),
  KEY `first_name_3` (`first_name`,`last_name`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_visualization_canvas` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `owner` enum('report','dashboard','visualization') DEFAULT NULL,
  `owner_id` int(11) DEFAULT NULL,
  `dashboard_id` int(11) DEFAULT NULL,
  `visualization_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `format` json DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `owner_visualization` (`owner`,`owner_id`,`visualization_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



CREATE TABLE `tb_visualizations` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL DEFAULT '',
  `slug` varchar(100) DEFAULT NULL,
  `image` varchar(200) DEFAULT NULL,
  `excel_format` json DEFAULT NULL,
  `description` varchar(1000) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


CREATE TABLE `tb_documentation` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(100) DEFAULT NULL,
  `heading` varchar(1024) DEFAULT NULL,
  `body` text,
  `parent` int(11) DEFAULT NULL,
  `chapter` int(11) DEFAULT NULL,
  `added_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  UNIQUE KEY `parent` (`parent`,`chapter`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8;

CREATE TABLE `tb_object_translations` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `account_id` int(11) DEFAULT NULL,
  `locale_id` int(11) NOT NULL,
  `owner` enum('query','visualization','phrase') NOT NULL DEFAULT 'phrase',
  `owner_id` int(11) NOT NULL DEFAULT '0',
  `phrase` varchar(100) NOT NULL DEFAULT '',
  `translation` varchar(100) NOT NULL DEFAULT '',
  `added_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_id` (`account_id`,`locale_id`,`owner`,`owner_id`,`phrase`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE `tb_locales` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `locale` varchar(30) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `name` varchar(50) DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=latin1;

INSERT INTO `tb_features` VALUES (4,'Table','table','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(5,'Spatial Map','spatialmap','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(6,'Funnel','funnel','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(7,'Cohort','cohort','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(8,'Line','line','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(9,'Bar','bar','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(10,'Area','area','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(11,'Stacked','stacked','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(12,'Pie','pie','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(13,'Live Number','livenumber','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(14,'Dual Axis Bar','dualaxisbar','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(15,'Bubble','bubble','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(16,'Big Text','bigtext','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(17,'Scatter','scatter','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(18,'Json','json','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(19,'MySQL','mysql','source','2018-05-28 10:33:13','2018-07-27 11:12:32'),
(20,'API','api','source','2018-05-28 10:33:13','2018-07-27 11:12:28'),
(21,'pgSQL','pgsql','source','2018-05-28 10:33:13','2018-07-27 11:12:45'),
(22,'BigQuery','bigquery','source','2018-05-28 10:33:13','2018-07-27 11:12:24'),
(23,'HTML','html','visualization','2018-06-27 06:55:22','2018-06-27 06:55:22'),
(24,'MongoDB','mongo','source','2018-07-23 11:20:07','2018-07-23 11:20:16'),
(25,'File','file','source','2018-07-27 12:21:36','2018-12-31 09:12:59'),
(26,'Linear','linear','visualization','2018-05-28 10:24:00','2018-05-28 10:24:00'),
(27,'Sankey','sankey','visualization','2018-10-25 15:26:11','2018-10-25 15:26:11'),
(28,'Calendar Heatmap','calendar','visualization','2018-11-21 15:32:36','2018-11-21 16:30:53'),
(29,'Bigquery Legacy','bigquery_legacy','source','2018-12-05 15:02:07','2018-12-05 15:02:07');

INSERT INTO `tb_visualizations` VALUES (1,'Table','table','https://i.imgur.com/t9yW97t.png',NULL,NULL,'2018-04-03 05:10:42','2018-05-04 10:13:04'),
(2,'Spatial Map','spatialmap','https://i.imgur.com/gDxBW8Z.png',NULL,NULL,'2018-04-03 05:13:26','2018-05-08 10:50:16'),
(3,'Funnel','funnel','https://i.imgur.com/bBJIrBo.png',NULL,NULL,'2018-04-03 05:13:26','2018-05-04 10:13:23'),
(4,'Cohort','cohort','https://i.imgur.com/y8Fnq1p.png',NULL,NULL,'2018-04-03 05:13:26','2018-05-04 10:13:38'),
(5,'Line','line','https://i.imgur.com/Rz8MCXI.png','{\"type\": \"line\"}',NULL,'2018-04-03 05:13:26','2018-05-04 10:13:50'),
(6,'Bar','bar','https://i.imgur.com/ItNpKis.png','{\"type\": \"column\"}',NULL,'2018-04-03 05:13:26','2018-05-04 10:14:05'),
(7,'Area','area','https://i.imgur.com/4lVeuw1.png','{\"type\": \"area\"}',NULL,'2018-04-03 05:13:26','2018-06-11 14:48:28'),
(8,'Stacked','stacked','https://i.imgur.com/7PLntjB.png',NULL,NULL,'2018-04-03 05:13:26','2018-05-04 10:14:33'),
(9,'Pie','pie','https://i.imgur.com/9VDKnlz.png','{\"type\": \"pie\"}',NULL,'2018-04-03 05:13:26','2018-07-25 08:57:26'),
(10,'Live Number','livenumber','https://i.imgur.com/xxcMnSv.png',NULL,NULL,'2018-04-13 09:45:48','2018-10-15 12:16:12'),
(11,'Dual Axis Bar','dualaxisbar','https://i.imgur.com/5Csusur.png',NULL,NULL,'2018-04-23 10:02:09','2018-05-04 10:15:25'),
(12,'Bubble','bubble','https://i.imgur.com/UtECRk2.png',NULL,NULL,'2018-04-24 10:01:35','2018-05-08 10:51:26'),
(13,'Big Text','bigtext','https://i.imgur.com/zip77tn.png',NULL,'Show any big text on the page.','2018-04-24 10:01:49','2018-06-27 06:57:10'),
(14,'Scatter','scatter','https://i.imgur.com/mBxqW9e.png',NULL,NULL,'2018-05-01 11:07:22','2018-05-08 10:50:40'),
(15,'JSON','json','https://i.imgur.com/ydjKDYl.png',NULL,'Show the raw response as JSON in a well formatted UI.','2018-05-04 13:32:51','2018-07-27 09:51:17'),
(16,'HTML','html',NULL,NULL,'Add any arbitrary HTML, CSS or JavaScript into the page.','2018-06-27 06:56:31','2018-06-27 06:56:31'),
(17,'Linear','linear','https://i.imgur.com/5Csusur.png',NULL,'Add a any combination of Line, Bar, Area or Stacked graphs on a single graph\'s Y axes.','2018-04-23 10:02:09','2018-08-24 10:57:51'),
(18,'Sankey','sankey',NULL,NULL,NULL,'2018-10-25 15:25:22','2018-10-25 15:25:22'),
(19,'Calender','calendar',NULL,NULL,NULL,'2018-11-21 15:29:56','2018-12-03 14:13:11');

INSERT INTO `tb_datasources` VALUES (1,'MySQL','mysql','https://svgshare.com/i/AQa.svg',1,'2018-08-31 16:13:47','2019-01-09 06:05:14'),
(2,'MSSQL','mssql','https://svgshare.com/i/ARK.svg',1,'2018-08-31 16:15:03','2019-01-09 06:04:09'),
(3,'PostgreSQL','pgsql','https://svgshare.com/i/AQk.svg',1,'2018-08-31 16:15:57','2019-01-09 06:07:31'),
(4,'Google Bigquery','bigquery','https://svgshare.com/i/AR6.svg',1,'2018-08-31 16:16:20','2019-01-09 06:07:55'),
(5,'Mongodb','mongo','https://svgshare.com/i/AQS.svg',1,'2018-08-31 16:16:30','2019-01-09 06:08:21'),
(6,'Oracle','oracle','https://svgshare.com/i/ARS.svg',1,'2018-08-31 16:16:44','2019-01-09 06:08:53'),
(7,'API','api','https://svgshare.com/i/AQv.svg',1,'2018-08-31 16:16:45','2019-01-09 06:09:16'),
(8,'File','file','https://svgshare.com/i/ARa.svg',1,'2018-08-31 16:16:58','2019-01-09 06:09:42'),
(9,'Google Bigquery Legacy','bigquery_legacy','https://svgshare.com/i/AR6.svg',1,'2018-08-31 16:16:20','2019-01-09 06:07:57');