#!/bin/bash
environment="$1"

cd /apps/node-apps/allspark/
cp config/sample.json config/$environment.json
sed -i "s|8080|3001|g" config/$environment.json
sed -i "s|mysql-host|mysql-local|g" config/$environment.json
sed -i "s|mysql-read|root|g" config/$environment.json
sed -i "s|mysql-write|root|g" config/$environment.json
sed -i "s|mysql-pass|password|g" config/$environment.json
sed -i "s|env-db|"$environment"_allspark|g" config/$environment.json
NODE_ENV="$environment" pm2 start bin/www --name "$environment"

cd /apps/node-apps/allspark/kato-allspark-companion
cp config/sample.json config/$environment.json
sed -i "s|8080|8001|g" config/$environment.json
sed -i "s|mysql-host|mysql-local|g" config/$environment.json
sed -i "s|mysql-read|root|g" config/$environment.json
sed -i "s|mysql-write|root|g" config/$environment.json
sed -i "s|mysql-pass|password|g" config/$environment.json
sed -i "s|env-db|"$environment"_allspark|g" config/$environment.json
npm install -g typescript@next
npm install --save underscore
npm install --save @types/underscore
NODE_ENV="$environment" pm2 start bin/www --name "$environment-comp"

sleep 20

#below port is for allspark
curl http://localhost:3001/api/v2/setup/run
pm2 restart all

cd /apps/node-apps/allspark/
nohup python3 main.py &
pm2 logs
