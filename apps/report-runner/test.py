import os

dir_ = "/var/www/html/storage/app/public/scraper/Excels/07-19-2024"

def process(file, path):
    if not os.path.exists( os.path.join(path, file) ) or os.path.isdir(file) or file[:6] == '.~lock': return

    delete = False
    if file.find('DeliveryManifest') != -1:
        delete = True
    elif file.find('CombinedManifest') != -1:
        delete = True
    elif file.find('ServiceAreaStatus') != -1:
        delete = True
    elif file.find('ServiceAreaSummary') != -1:
        delete = True
    elif file.find('PickupAssignments') != -1:
        delete = True
    elif file.find('PickupManifest') != -1:
        delete = True
    elif file.find('ReorderPUListings') != -1:
        delete = True
    
    try:
        if delete:
            print(file)
            os.remove(os.path.join(path, file))
        # else: print(file)
    except Exception as e:
        print(e)
        return False

for file in os.listdir(dir_):
    process(file, dir_)