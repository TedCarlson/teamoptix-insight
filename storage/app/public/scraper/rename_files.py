import pandas as pd
import os, re, sys

from datetime import datetime

def openExel(date_str, file, date_only=False):
    date = datetime.strptime(date_str, '%m-%d-%Y')
    ret = date.strftime("%Y%m%d")

    if date_only: return ret

    df = pd.read_excel(file, sheet_name='Header', header=0)

    rows = df.iloc[0:].values

    for x, y in rows:
        if x == 'WA#':
            ret += "_" + y
        elif x == 'SA#':
            ret += "_" + y
    
    return ret

def renameFile(folder_name, file, path):
    if not os.path.exists( os.path.join(path, file) ) or os.path.isdir(file) or file[:6] == '.~lock': return
    print(folder_name, os.path.join(path, file))
    _, ext = os.path.splitext(file)

    if file.find('DeliveryManifest') != -1:
        name = openExel(folder_name, os.path.join(path, file)) + ext
    elif file.find('CombinedManifest') != -1:
        name = 'CM_' + openExel(folder_name, os.path.join(path, file)) + ext
    elif file.find('ServiceAreaStatus') != -1:
        name = 'SAStatus_' + openExel(folder_name, os.path.join(path, file), True) + ext
    elif file.find('ServiceAreaSummary') != -1:
        name = 'SASummary_' + openExel(folder_name, os.path.join(path, file), True) + ext
    elif file.find('PickupAssignments') != -1:
        name = 'PA' + openExel(folder_name, os.path.join(path, file)) + ext
    elif file.find('PickupManifest') != -1:
        name = 'PM' + openExel(folder_name, os.path.join(path, file)) + ext
    elif file.find('ReorderPUListings') != -1:
        name = 'RPL' + openExel(folder_name, os.path.join(path, file)) + ext
    else:
        name = file
    
    try:
        os.rename(os.path.join(path, file), os.path.join(path, name))
        return True
    except Exception as e:
        print(e)
        return False

def renameFolder(path):
    folder_name = os.path.basename(path)
    print(folder_name)
    success = True
    for file in os.listdir(path):
        success = renameFile(folder_name, file, path) and success
    
    return success

if __name__ == '__main__':
    # print(sys.argv)
    try:
        if len(sys.argv) > 2 and sys.argv[1] == 'bulk' and os.path.exists(sys.argv[2]):
            print("Bulk rename in progress...")
            dir_ = sys.argv[2]
            for folder in os.listdir(dir_):
                full_path = os.path.join(dir_, folder)
                if os.path.isdir(full_path):
                    renameFolder(full_path)
    except Exception as e:
        print(e)

# D:\Work\Upwork\Upwork\fcms_admin\storage\app\public\scraper\Excels\Server\Excels Test