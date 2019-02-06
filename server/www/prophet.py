from flask import Blueprint
import pandas as pd
from fbprophet import Prophet
import dateutil.parser as parser
import numpy as np
import calendar
import re
import time

from ..utils.API import API


class Forecast(API, object):

    def __init__(self):
        super().__init__()

    def merge_df_column(self, df, first_pri, second_pri, new_col='', drop_both=True):

        if new_col:
            df[new_col] = df.apply(lambda row: row[second_pri] if not row[first_pri] else row[second_pri], axis=1)
        else:
            df[first_pri] = df.apply(lambda row: row[second_pri] if not row[first_pri] else row[second_pri], axis=1)

        if drop_both:

            if new_col != first_pri:
                del df[first_pri]

            if new_col != second_pri:
                del df[second_pri]

    def format_data_pre(self):

        for col in self.options["data"]:

            self.df[col] = self.df[col].apply(pd.to_numeric, errors='coerce')

        if (self.column_info.get(self.options['timing'], {'type': {'name': None}}))['type'] == 'string' \
                or (self.column_info.get(self.options['timing'], {'type': {'name': None}}))['type'] == 'date':
            split = 10

        elif (self.column_info.get(self.options['timing'], {'type': {'name': None}}))['type'] == 'month':
            split = 7

        else:
            split = 10

        timing_column_type = (self.column_info.get(self.options['timing'], {'type': {'name': None}}))['type']

        if timing_column_type.get('name', timing_column_type) == 'string' or \
                timing_column_type.get('name', timing_column_type) == 'date':
            self.freq = 'd'

        elif timing_column_type.get('name', timing_column_type) == 'month':
            self.freq = 'm'

        else:
            self.freq = 'd'

        self.df['ds'] = self.df[self.options['timing']].apply(lambda x: (str(parser.parse(x)))[:split])

        if self.freq == 'm':
            self.monthly_data_postfix(self.df, 'ds', None)

    def monthly_data_postfix(self, series, column_name, postfix):

        if self.freq == 'm':
            series[column_name] = series[column_name].apply(
                lambda x: '-'.join(x.split('-')[:-1]) + '-' + (
                    postfix if postfix else str(calendar.monthrange(int(x.split('-')[0]), int(x.split('-')[1]))[-1])))

    def format_column_names(self):

        for column in list(self.series):

            if column.endswith('_x'):
                self.series[column] = np.where(self.series[column[:-2] + '_y'].isnull(), self.series[column],
                                               self.series[column[:-2] + '_y'])

                self.series.rename(columns={column: column[:-2]}, inplace=True)

        for column in list(self.series):

            if column.endswith('_y') or column == 'ds':
                del self.series[column]

    def make_forecast(self, df, ds, y, days):

        df.rename(columns={y: 'y'}, inplace=True)

        model = Prophet(seasonality_mode='multiplicative')
        model.fit(df[:int(len(df) if not int(self.options['offset']) else int(self.options['offset']))])

        future = model.make_future_dataframe(periods=int(days), freq=self.freq)

        forecast_data = model.predict(future)

        forecast_data = forecast_data[['ds', 'yhat', 'yhat_lower', 'yhat_upper']]

        if not hasattr(self, 'series'):
            self.series = future[['ds']].copy()

        forecast_data.rename(
            columns={"ds": ds, "yhat": y + '_forecast', "yhat_lower": y + "_lower",
                     "yhat_upper": y + "_upper"}, inplace=True
        )

        df.rename(columns={'y': y}, inplace=True)

        self.connected_columns[y + '_forecast'] = y
        self.connected_columns[y + '_lower'] = y
        self.connected_columns[y + '_upper'] = y

        self.series = self.series.merge(forecast_data, left_on='ds', right_on='timing', how='inner')

        self.series['ds'] = self.series['ds'].apply(lambda x: (str(x))[:10])
        self.series = self.series.merge(self.df, left_on='ds', right_on='ds', how='left')

        self.merge_df_column(self.series, 'timing_y', 'timing_x', 'timing')

        return forecast_data

    def forecast(self, options, data, column_info):

        start = time.perf_counter()

        self.options = options
        self.options['timing'] = self.options.get('timing', 'timing')
        self.column_info = {}

        self.connected_columns = {}

        if not isinstance(column_info, list):
            column_info = [column_info]

        for a in column_info:
            self.column_info[a['key']] = a

        self.df = pd.DataFrame(data)

        initial_columns = list(self.df)

        print('initial columns:', initial_columns)

        self.format_data_pre()
        self.options['timing'] = self.options.get('timing', 'timing')
        self.maxDs = parser.parse(self.df[self.options.get('timing', 'timing')].max(), fuzzy=True, ignoretz=True)

        if not len(self.options.get("data", [])):

            return data

        for col in (self.options.get("data", [])):
            self.make_forecast(self.df.copy(), self.options["timing"], col, self.options["extrapolate"])

        self.format_column_names()

        self.series[self.options['timing']] = self.series[self.options['timing']].apply(
            lambda x: str(x)[0:len(self.df[self.options['timing']][0])])

        timing_column_type = (self.column_info.get(self.options['timing'], {'type': {'name': None}}))['type']

        if timing_column_type.get('name', timing_column_type) == 'month':
            self.series[self.options['timing']] = self.series[self.options['timing']].apply(
                lambda x: '-'.join(x.split('-')[:-1] + ['01']))

            self.df[self.options['timing']] = self.df[self.options['timing']].apply(
                lambda x: '-'.join(x.split('-')[:-1] + ['01']))

        self.series = self.series.merge(self.df, left_on=self.options['timing'], right_on='timing', how='left')

        self.format_column_names()

        self.series.fillna(0, inplace=True)

        new_columns = list(filter(lambda x: x not in initial_columns or x == self.options['timing'], list(self.series)))

        data = self.series[new_columns].to_dict('records')

        final_data = {
            "rows": [],
            "connecting_column": self.options.get('timing'),
            "time_taken": time.perf_counter() - start,
        }

        for row in data:
            temp_row = {}

            for column in row:

                if column == self.options.get('timing'):
                    temp_row[column] = row[column]
                    continue

                if not temp_row.get(self.connected_columns[column]):
                    temp_row[self.connected_columns[column]] = {}

                connected_columns_name = self.connected_columns[column]

                if not connected_columns_name:
                    continue

                temp_row[connected_columns_name][
                    re.match('^' + re.escape(connected_columns_name) + '_(.*)', column).group(1)] = row[column]

            final_data["rows"].append(temp_row)

        return final_data


forecast = Blueprint("forecast", __name__)


@forecast.route("/get", methods=["POST"])
def create():
    f = Forecast()
    return f.send_response(f.execute(f.forecast))
