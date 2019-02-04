import config
from server.utils.Application import *
from server.www.xlsx import xlsx
from server.www.oauth.googleAdwords import ga
from server.www.prophet import forecast

BLUEPRINTS = {
    xlsx: "/xlsx",
    ga: "/adwords",
    forecast: "/forecast"
}

app = Application(BLUEPRINTS)
application = app.create_app(config, __name__)

for blueprint in BLUEPRINTS:
    application.register_blueprint(blueprint, url_prefix=BLUEPRINTS[blueprint])


@application.route('/')
def hello_world():
    return app.send_response('Hello world')


# @application.errorhandler(Exception)
# def handle_error(e):
#     return app.send_response(str(e), False)


if __name__ == '__main__':
    print("************************ Application Started! ************************")
    print("************************ Running on ", config.HOST, ':', config.PORT, " ************************")
    application.run(host=config.HOST, port=config.PORT, threaded=True)
