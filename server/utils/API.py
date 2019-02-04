from .Principal import Principal
from flask import request
import config
from .common_functions import get_function_signature


class API(Principal):
    def __init__(self):
        """log API """
        Principal.__init__(self)
        self.request = request

        self.config = config

        if self.request.method == 'POST':
            form_data = {
                i: dict(self.request.form)[i] if len(dict(self.request.form)[i]) > 1 else dict(self.request.form)[i][0]
                for i in dict(self.request.form or {})
            }

            request_json = {
                i: dict(self.request.json)[i] if len(dict(self.request.json)[i]) > 1 else dict(self.request.json)[i]
                for i in dict(self.request.json or {})
            }

            form_data.update(request_json)

            for i in self.request.files:
                form_data[i] = request.files[i]

        else:

            form_data = {
                i: dict(self.request.values)[i] if len(dict(self.request.values)[i]) > 1 else
                dict(self.request.values)[i][0] for i in dict(request.values or {})
            }

        self.host = request.headers['Host']
        self.formatted_request_body = form_data

    def validate(self, func):
        arguments, defaults = get_function_signature(func)
        result_arg_list = []

        for argument in arguments:
            if argument == 'self':
                continue

            if argument not in self.formatted_request_body and argument not in defaults:
                raise AssertionError('Missing argument: ' + str(argument))

            else:
                result_arg_list += [self.formatted_request_body.get(argument) or defaults.get(argument)]

        return result_arg_list

    def execute(self, func):
        return func(*self.validate(func))
