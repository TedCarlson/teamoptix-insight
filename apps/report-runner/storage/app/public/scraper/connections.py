import mysql.connector
import os, platform, time
from typing import List, Union
from datetime import datetime

def getConnection() -> List[Union[mysql.connector.connection.MySQLConnection, mysql.connector.cursor.MySQLCursor]]:
    try:
        connection = mysql.connector.connect(
            host=os.environ.get('FCMS_DB_HOST', '127.0.0.1'),
            user=os.environ.get('FCMS_DB_USER', ''),
            password=os.environ.get('FCMS_DB_PASSWORD', ''),
            database=os.environ.get('FCMS_DB_NAME', 'fcms')
        )

        if connection.is_connected():
            print('Connected to MySQL database')
        else:
            exit()

        cursor = connection.cursor(dictionary=True)

        return [connection, cursor]
    except mysql.connector.Error as error:
        print(f"Error while connecting to MySQL: {error}")
        return [None, None]

def closeConnection(connection: mysql.connector.connect):
    connection.close()

def isPlatformLinux():
    return platform.system().lower() == 'linux'

def getScrapingConfig(CONNECTION, CURSOR):
    runtime_username = os.environ.get("FCMS_FEDEX_USERNAME", "").strip()
    runtime_password = os.environ.get("FCMS_FEDEX_PASSWORD", "").strip()

    if runtime_username and runtime_password:
        return {
            "can_scrape": True,
            "username": runtime_username,
            "password": runtime_password,
            "source": "insight_runtime"
        }

    CURSOR.execute("SELECT * FROM scraper_config")
    
    found = {}

    for row in CURSOR.fetchall():
        found = row
        break
    
    if len(found): return found

    query = f'INSERT INTO scraper_config (can_scrape) VALUES (0)'

    try:
        CURSOR.execute(query)
        CONNECTION.commit()
    except Exception as e:
        print(e)

    return {
        "can_scrape": False, 
        'username': '',
        'password': '',
        "source": "legacy_local"
    }

def writeError(download_date, error, name, start_time):
    CONNECTION, CURSOR = getConnection()

    download_date = datetime.strptime(download_date, '%m-%d-%Y')
    download_date = download_date.strftime('%Y-%m-%d %H:%M:%S')
    
    start_time = datetime.fromtimestamp(start_time).strftime('%Y-%m-%d %H:%M:%S')
    end_time = datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d %H:%M:%S')

    query = 'INSERT INTO error_logs (download_date, name, error, start_time, end_time) VALUES (%s, %s, %s, %s, %s)'

    try:
        CURSOR.execute(query, [download_date, name, error, start_time, end_time])
        CONNECTION.commit()
    except Exception as e:
        print(e)

    closeConnection(CONNECTION)

def getMainFolder():
    return os.environ.get(
        "FCMS_SCRAPER_HOME",
        os.path.dirname(os.path.abspath(__file__))
    )

def getDailyServiceOptions():
    return 8