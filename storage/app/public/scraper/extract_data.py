import pandas as pd
import os, re, sys, json

from datetime import datetime
from collections import defaultdict

from connections import getConnection, closeConnection, getMainFolder

all_data = {
    'Delivery Manifest': {
        'Stop Details': [],
        'Package Details': []
    },
    'Combined Manifest': {
        'Stop Details': []
    },
    'Pickup Assignments': {
        'Details': []
    },
    'Pickup Manifest': {
        'Stop Details': []
    },
    'Reorder PU Listings': {
        'Details': []
    },
    'Service Area Summary': {
        'Service Area Summary': []
    },
    'Service Area Status': {
        'Work Area Details': []
    },
    'Daily Service Worksheet': {
        'Daily Service Worksheet': []
    }
}

DIRECTORY = os.path.join(getMainFolder(), 'Excels')

if not os.path.exists(DIRECTORY):
    os.mkdir(DIRECTORY)

def openExel(excel, folder_name):
    global all_data
    excel_name = os.path.basename(excel)

    df = pd.read_excel(excel, sheet_name=None)

    date = datetime.strptime(folder_name, '%m-%d-%Y')
    date = date.strftime('%Y-%m-%d %H:%M:%S')

    if 'Header' not in df:
        sheet_name = list(df.keys())[0]
        if sheet_name != 'Daily Service Worksheet': return
        # Convert these columns to object dtype (compatible with strings)
        float_columns = df[sheet_name].select_dtypes(include=['float64']).columns
        df[sheet_name][float_columns] = df[sheet_name][float_columns].astype(object)
        df[sheet_name].fillna('', inplace=True)
        
        columns = list(df[sheet_name].iloc[2].values)[:35]
        
        if len(all_data[sheet_name][sheet_name]) == 0:
            all_data[sheet_name][sheet_name].append(columns + ['Download Date'])

        rows = []
        for row in df[sheet_name].iloc[3:].values:
            row = list(row)[:35]
            if row[0].find('Contract') != -1: break
            valid = True
            for val in row[5:13]:
                if len(val) == 0:
                    valid = False
                    break
            if valid: all_data[sheet_name][sheet_name].append(row + [date])

        return

    _, sheet_name = df['Header'].columns.tolist()

    if sheet_name in all_data:
        for sheet in all_data[sheet_name]:
            float_columns = df[sheet].select_dtypes(include=['float64']).columns
            # Convert these columns to object dtype (compatible with strings)
            df[sheet][float_columns] = df[sheet][float_columns].astype(object)
            df[sheet].fillna('', inplace=True)

            if len(all_data[sheet_name][sheet]) == 0:
                all_data[sheet_name][sheet].append(df[sheet].columns.tolist() + ['Download Date'])

            if sheet_name == 'Service Area Status':
                for row in df[sheet].values:
                    row = list(row) + [date]
                    if len(row[3]) > 0:
                        all_data[sheet_name][sheet].append(row)
            else:
                for row in df[sheet].values:
                    all_data[sheet_name][sheet].append(list(row) + [date])

def processFolder(folder, CONNECTION, CURSOR):
    files = os.listdir(folder)
    folder_name = os.path.basename(folder)
    print(folder_name)
    for file in files:
        path = os.path.join(folder, file)
        if os.path.isfile(path) and file[-3:] == 'xls':
            openExel(path, folder_name)

    writeToDatabase(folder_name, CONNECTION, CURSOR)

def writeToOutput():
    for excel in all_data:
        excel_writer = pd.ExcelWriter(os.path.join(OUTPUT_DIRECTORY, f'{excel}.xlsx'), engine='xlsxwriter')

        for sheet in all_data[excel]:
            rows, columns = all_data[excel][sheet][1:], all_data[excel][sheet][0]
            df = pd.DataFrame(rows, columns=columns)
            df.to_excel(excel_writer, sheet_name=sheet, index=False)
        
        excel_writer.close()

def writeToDatabase(folder, CONNECTION, CURSOR):
    global all_data
    tables = {
        'Delivery Manifest:Stop Details': 'delivery_manifest_stop',
        'Delivery Manifest:Package Details': 'delivery_manifest_package',
        'Combined Manifest:Stop Details': 'combined_manifest',
        'Pickup Assignments:Details': 'pickup_assignments',
        'Pickup Manifest:Stop Details': 'pickup_manifest',
        'Reorder PU Listings:Details': 'reorder_pu_listings',
        'Service Area Summary:Service Area Summary': 'service_area_summary',
        'Service Area Status:Work Area Details': 'service_area_status',
        'Daily Service Worksheet:Daily Service Worksheet': 'daily_service_worksheet'
    }

    for table in tables:
        CURSOR.execute(f"DELETE FROM {tables[table]} WHERE DATE(download_date)=STR_TO_DATE('{folder}', '%m-%d-%Y')")
        CONNECTION.commit()
    
    for excel in all_data:
        for sheet in all_data[excel]:
            table = tables[f"{excel}:{sheet}"]

            if len(all_data[excel][sheet]) <= 1: continue

            rows, columns = all_data[excel][sheet][1:], all_data[excel][sheet][0]
            all_data[excel][sheet] = []
            feilds = []

            for column in columns:
                column = column.replace('#', '').replace('&', '').replace("'", '').replace(".", '').replace('%', '').replace('(', '').replace(')', '').replace('/', ' ').strip()
                column = column.lower().split(' ')
                column = [col for col in column if len(col) > 0]
                column = '_'.join(column)
                feilds.append(column)
            
            columns = '(`' + str('`,`'.join(feilds)) + '`)'
            values = '(' + ','.join(['%s' for _ in feilds]) + ')'
            
            query = f'INSERT INTO {table} {columns} VALUES {values}'

            try:
                CURSOR.executemany(query, rows)
                CONNECTION.commit()
            except Exception as e:
                print(e)
                print(folder, excel)
                print(query)
                for row in rows:
                    print(row[1], len(row), len(columns))
                sys.exit()

def extractDataFromFolder(folder):
    if len(re.sub('\d\d\-\d\d\-\d\d\d\d', '', folder)) == 0:
        path = os.path.join(DIRECTORY, folder)
        if os.path.exists(path) and os.path.isdir(path):
            CONNECTION, CURSOR = getConnection()
            processFolder(path, CONNECTION, CURSOR)
            closeConnection(CONNECTION)

if __name__ == '__main__':
    try:
    # if True:
        if len(sys.argv) > 1:
            arg_1 = sys.argv[1]
            if arg_1 == 'folder' and len(sys.argv) > 2:
                arg_2 = sys.argv[2]
                if len(re.sub('\d\d\-\d\d\-\d\d\d\d', '', arg_2)) == 0:
                    path = os.path.join(DIRECTORY, arg_2)
                    if os.path.exists(path) and os.path.isdir(path):
                        CONNECTION, CURSOR = getConnection()
                        processFolder(path, CONNECTION, CURSOR)
                        closeConnection(CONNECTION)
                    else:
                        print(f"{arg_2} folder not found...")
                else:
                    print("Not a valid argument.. Ex. 05-20-2024")
            elif arg_1 == 'bulk':
                CONNECTION, CURSOR = getConnection()
                folders = os.listdir(DIRECTORY)
                for folder in folders:
                    path = os.path.join(DIRECTORY, folder)
                    if len(re.sub('\d\d\-\d\d\-\d\d\d\d', '', folder)) == 0 and os.path.exists(path) and os.path.isdir(path):
                        processFolder(path, CONNECTION, CURSOR)
                # writeToOutput()
                closeConnection(CONNECTION)
            else:
                print("No valid arguments passed...")

    except Exception as e:
        print(e)

