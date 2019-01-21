import os

import pandas as pd
from flask import Blueprint
from vincent.colors import brews

from ..utils.API import API
from ..utils.common_functions import guess_excel_col_name


class XLSX(API, object):
    def __init__(self):
        super().__init__()

    @staticmethod
    def plot(worksheet, workbook, dataframe, type, sheet_name, x, y, xl_col, legend, show_values):
        max_row = len(dataframe) + 1
        chart = workbook.add_chart(type)
        secondry_col = y.get("y2", {}).get("name", None)

        for i in range(len(list(dataframe.columns))):
            col = i + 1
            series_obj = {
                'name': [sheet_name, 0, col],
                'categories': [sheet_name, 1, 0, max_row, 0],
                'values': [sheet_name, 1, col, max_row, col],
                'line': {'width': 3.00},
                'marker': {
                    'type': 'circle',
                    'size': 7,
                    'fill': {
                        'color': brews['Set3'][i]
                    }
                },
                'data_labels': {'value': True},
            }

            if list(dataframe.columns)[i] == secondry_col:
                series_obj['y2_axis'] = 1

            chart.add_series(series_obj)

        if not type["type"] in ["pie", "doughnut"]:
            chart.set_x_axis({'name': x['name'], 'date_axis': x.get("date_axis", False), })
            chart.set_y_axis({'name': y['name'], 'major_gridlines': {'visible': True}})

        if secondry_col:
            chart.set_y2_axis(y["y2"])

        if legend:
            chart.set_legend({'position': 'top'})
        else:
            chart.set_legend({'none': True})

        worksheet.insert_chart(xl_col, chart)
        return chart  # to combine

    @staticmethod
    def format_data(list_of_dicts, transpose=1):
        if not len(list_of_dicts):
            return []

        keys = list_of_dicts[0].keys()

        data = {}

        for k in keys:
            data[k] = []

        for row in list_of_dicts:
            for key in keys:
                data[key].append(row[key])

        dataframe = pd.DataFrame.from_dict(data, orient='index')
        if transpose:
            dataframe = dataframe.transpose()
        dataframe.reset_index(drop=True, inplace=True)

        dataframe = dataframe.fillna(0)

        col = guess_excel_col_name(len(dataframe.columns) + 4)

        return [dataframe, col]

    def make(self, data_obj):
        lim = 2
        start_row = 0

        if type(data_obj) == dict:
            data_obj = [data_obj]

        for d in data_obj:
            excel_file = os.getcwd() + "/excel_exports/" + d["file_name"] + '.xlsx'
            writer = pd.ExcelWriter(excel_file, engine='xlsxwriter', )
            data = self.format_data(d["series"])
            col = data[1]
            data = data[0]
            workbook = writer.book

            # worksheet.set_column('A:A', 20)
            fuse_to_break_printing_same_data = 0
            for chart in d["charts"]:
                c = d["charts"][chart]
                columns_to_use = c.get("cols", [])

                if c.get("x2", None) and not c.get("x", None):
                    c["x"] = {"x2": c.get("x2", None)}
                elif c.get("x2", None) and c.get("x", None):
                    c["x"]["x2"] = c["x2"]
                else:
                    pass

                if c.get("y2", None) and not c.get("y", None):
                    c["y"] = {"y2": c.get("y2", None)}
                elif c.get("y2", None) and c.get("y", None):
                    c["y"]["y2"] = c["y2"]
                else:
                    pass

                if not len(columns_to_use) and c["type"].get("type", "") not in ["pie", "doughnut"]:
                    continue

                if c["type"].get("type", "") in ["pie", "doughnut"]:
                    columns_to_use = list(data.columns)

                refined_data = data[data.columns.intersection(columns_to_use)]
                if c["type"].get("type", "") in ["pie", "doughnut"]:
                    k = [{i: i for i in list(refined_data.columns)}]

                    refined_data = refined_data.append(k)

                    maxidx = refined_data.index[-1]
                    refined_data.index = pd.RangeIndex(maxidx + 1, maxidx + 1 + len(refined_data))

                    refined_data = refined_data.transpose()

                    refined_data.columns = [c["y"].get("name", "y"), c["x"].get("name", "x")]

                refined_data = refined_data.set_index(c["x"].get("name", "x"))

                if fuse_to_break_printing_same_data == 0 and c["type"].get("type", "") not in ["pie", "doughnut"]:
                    data.set_index(c["x"].get("name", "x")).to_excel(writer, sheet_name=d["sheet_name"],
                                                                     startrow=start_row)

                elif fuse_to_break_printing_same_data == 0 and c["type"].get("type", "") in ["pie", "doughnut"]:
                    refined_data.to_excel(writer, sheet_name=d["sheet_name"], startrow=start_row)

                worksheet = writer.sheets[d["sheet_name"]]

                self.plot(worksheet, workbook, refined_data, c["type"], d["sheet_name"], c["x"], c["y"], col + str(lim),
                          d["show_legends"], d["show_values"])
                lim += len(refined_data) + 13
                start_row += len(refined_data) + 13
                fuse_to_break_printing_same_data += 1

        workbook.close()
        return excel_file


xlsx = Blueprint("xlsx", __name__)


@xlsx.route("/get", methods=["POST"])
def create():
    xl = XLSX()
    return xl.send_response(xl.execute(xl.make))
