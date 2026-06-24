#!/root/Script/myenv/bin/python

import os, requests, json, sys
from bs4 import BeautifulSoup
import csv, re, time
from selenium import webdriver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import Select
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import StaleElementReferenceException
from sys import platform
import shutil
import threading
from datetime import datetime   

from webdriver_manager.chrome import ChromeDriverManager

from rename_files import renameFolder
from extract_data import extractDataFromFolder

from connections import getConnection, closeConnection, getScrapingConfig, getMainFolder, writeError, isPlatformLinux, getDailyServiceOptions

# 
import logging
log_folder = os.path.join(getMainFolder(), 'Logs')
if not os.path.exists(log_folder): os.mkdir(log_folder)
log_file = f"specific_date_{datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d_%H_%M_%S')}.log"

logging.basicConfig(filename=os.path.join(log_folder, log_file), level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
# 

MAIN_FOLDER = os.path.join(getMainFolder(), 'Excels')

if not os.path.exists(MAIN_FOLDER):
    os.mkdir(MAIN_FOLDER)

# Checking table for scraping configuration
CONNECTION, CURSOR = getConnection()

SCRAP_INFO = getScrapingConfig(CONNECTION, CURSOR)
SCRAPE_DATE = ''
START_TIME = time.time()

logging.info(SCRAP_INFO)

if SCRAP_INFO['scrape_on_active'] and SCRAP_INFO['scrape_on'] and not SCRAP_INFO['scrape_on_progress']:
    if not SCRAP_INFO['can_scrape'] or len(SCRAP_INFO['username']) == 0 or len(SCRAP_INFO['password']) == 0:
        logging.info("No permission to scrape as per admin panel or username and/or password not configured on admin panel")
        closeConnection(CONNECTION)
        sys.exit()
    SCRAPE_DATE = SCRAP_INFO['scrape_on'].strftime('%m/%d/%Y')
    logging.info("Scraping Date: " + SCRAPE_DATE)
else:
    closeConnection(CONNECTION)
    sys.exit()

closeConnection(CONNECTION)
# 

current_date = SCRAP_INFO['scrape_on']
formatted_date = current_date.strftime("%m-%d-%Y")

DOWNLOAD_FOLDER = os.path.join(MAIN_FOLDER, formatted_date)

logging.info(current_date + " " + formatted_date + " " + DOWNLOAD_FOLDER)

if not os.path.exists(DOWNLOAD_FOLDER):
    os.mkdir(DOWNLOAD_FOLDER)

FOLDERS = [
    os.path.join(MAIN_FOLDER, 'P_D_Manifest'), # 0
    os.path.join(MAIN_FOLDER, 'P_D_Manifest', 'Pickup Manifest'), # 1
    os.path.join(MAIN_FOLDER, 'P_D_Manifest', 'Delivery Manifest'), # 2
    os.path.join(MAIN_FOLDER, 'P_D_Manifest', 'Combined Manifest'), # 3
    
    os.path.join(MAIN_FOLDER, 'Service Area Status'), # 4
    os.path.join(MAIN_FOLDER, 'Service Area Status', 'Work Area Summary'), # 5
    os.path.join(MAIN_FOLDER, 'Service Area Status', 'Service Area Summary'), # 6

    os.path.join(MAIN_FOLDER, 'Pickup Alerts'), # 7

    os.path.join(MAIN_FOLDER, 'SCH PU Mgmt'), # 8
    os.path.join(MAIN_FOLDER, 'SCH PU Mgmt', 'Reorder PU Listings'), # 9
    os.path.join(MAIN_FOLDER, 'SCH PU Mgmt', 'Pickup Assignments'), # 10

    os.path.join(MAIN_FOLDER, 'Daily Service Worksheet'), # 11
]

def checkDownloadsHelper(index):
    prev = len(os.listdir(MAIN_FOLDER))
    start_time = time.time()

    while prev == len(os.listdir(MAIN_FOLDER)) and time.time() - start_time <= 12:
        time.sleep(2)

    if len(os.listdir(MAIN_FOLDER)) != prev:
        for file in os.listdir(MAIN_FOLDER):
            if not os.path.isdir(os.path.join(MAIN_FOLDER, file)):
                if file.find('crdownload') != -1:
                    while os.path.exists(os.path.join(MAIN_FOLDER, file)):
                        pass
                    checkDownloadsHelper(index)
                else:
                    shutil.move( os.path.join(MAIN_FOLDER, file), os.path.join(FOLDERS[index], file) )

def checkDownloads(index):
    logging.info("Downloading " + FOLDERS[index] + ' to ' + DOWNLOAD_FOLDER)
    # thread = threading.Thread(target=checkDownloadsHelper, args=(index, ))
    # thread.start()

def getDriver():
    options = webdriver.ChromeOptions() 
    options.add_argument("start-maximized")
    # options.binary_location = '/usr/bin/google-chrome'

    if isPlatformLinux(): options.add_argument('--headless=new')
    # options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')

    # options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')

    options.add_argument("--enable-javascript")

    options.add_experimental_option('prefs', {'download.default_directory': DOWNLOAD_FOLDER})
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.125 Safari/537.36")
    # options.add_argument('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.50 Safari/537.36')
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option('useAutomationExtension', False)

    # 
    options.add_argument('--ignore-certificate-errors')
    options.add_argument('--allow-running-insecure-content')
    # 

    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    # driver = webdriver.Chrome(options=options)
    return driver

def element_opacity_exists(el_ID):
    def _predicate(driver):
        try:
            # element = driver.find_element(By.XPATH, "//div[@class='yui-content ui-tabs-panel ui-widget-content ui-corner-bottom']")
            element = driver.find_element(By.XPATH, f"//li[@id='{el_ID}']")
            return element.get_attribute("class") == "ui-state-default ui-corner-top ui-state-active"
            # return opacity is not None and opacity != ""
        except Exception as e:
            return False
    return _predicate

SECTION_LIST = ["P&D", "Service", "Pickup", "SCH", "Daily Service"]
ACTIVE_SECTION = ''
ACTIVE_SECTION_OPTION = 0

def scrollTo(el, driver):
    desired_y = (el.size['height'] / 2) + el.location['y']
    current_y = (driver.execute_script('return window.innerHeight') / 2) + driver.execute_script(
    'return window.pageYOffset')
    scroll_y_by = desired_y - current_y
    driver.execute_script("window.scrollBy(0, arguments[0]);", scroll_y_by)

def main(section_='', option_=0, retry=1):
    global SECTION_LIST, ACTIVE_SECTION, ACTIVE_SECTION_OPTION
    driver = getDriver()
    logging.info("Driver loaded...")
    init_url = "https://mybizaccount.fedex.com/my.policy"

    driver.get(init_url)
    logging.info("Visiting https://mybizaccount.fedex.com/my.policy")
    try:
        btn = WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.XPATH, "//input[@class='credentials_input_submit']")))
        btn.click()

        username = WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.XPATH, '//input[@name="identifier"]')))

        logging.info("On login page....")
        
        password = driver.find_element(By.XPATH, '//input[@name="credentials.passcode"]')
        time.sleep(1)
        # '8478029'
        username.send_keys(SCRAP_INFO['username'])
        time.sleep(1)
        
        # '8478029#Redd'
        password.send_keys(SCRAP_INFO['password'])
        time.sleep(1)

        # 8478029#Redd!

        # 8478029
        # 8478029#Redd

        password.send_keys(Keys.ENTER)

        WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//a[@id='PT_HOME']")))
        # WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//div[@class='gf_header-welcometext']")))

        # //div[@class='gf_header-welcometext']
        # //div[@class='gf_header-UserDtl']

        logging.info("Login successfull!")
        
        # headers = driver.execute_script("var req = new XMLHttpRequest();req.open('GET', document.location, false);req.send(null);return req.getAllResponseHeaders()")
        # headers = headers.splitlines()
        
        # logging.info(json.dumps(headers, indent=2))

        # cookie = driver.execute_script("return document.cookie")
        # logging.info("Cookie:", cookie)

        secion_index = 0

        if (section_ != ''):
            for index, sec in enumerate(SECTION_LIST):
                if sec == section_:
                    secion_index = index
                    break

        if secion_index <= 3:
            iframe = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//iframe[@title='FCC Links']")))

            driver.switch_to.frame(iframe)

            customer_connection = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//a[contains(text(), 'FedEx Customer Connection')]")))

            # logging.info(customer_connection.get_attribute('href'))

            customer_connection.click()

            driver.switch_to.default_content()

            WebDriverWait(driver, 30).until(EC.number_of_windows_to_be(2))

            window_handles = driver.window_handles
            customer_connection_page_handle = window_handles[-1]
            driver.switch_to.window(customer_connection_page_handle)

            customer_connection_page_title = driver.title
            logging.info("Title of the customer_connection page: " + customer_connection_page_title)

            WebDriverWait(driver, 60).until(EC.presence_of_element_located((By.XPATH, "//li[@id='mainTabSettab_1']")))
            time.sleep(5)
        
        if secion_index <= 0:
            # P&D Mainifests
            ACTIVE_SECTION = 'P&D'
            logging.info("Accessing P&D")
            p_d = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//li[@id='mainTabSettab_1']")))
            time.sleep(2)
            p_d.click()

            # manifestForm:date_input
            date_element = WebDriverWait(driver, 30).until( EC.presence_of_element_located( (By.XPATH, "//input[@id='manifestForm:date_input']") ) )
            
            script = "document.getElementById('manifestForm:date_input').value = '{}';".format(SCRAPE_DATE)
            driver.execute_script(script)
            time.sleep(1)

            date_element.send_keys(Keys.ENTER)
            time.sleep(1)
            date_element.send_keys(Keys.ESCAPE)
            time.sleep(2)

            select_element = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//select[@id='manifestForm:workAreas']")))

            total_select_options = len(select_element.find_elements(By.XPATH, 'option'))

            for i in range(option_, total_select_options):
                # if i == 0: continue
                logging.info(f'Selecting option {i}')
                ACTIVE_SECTION_OPTION = i
                select_element = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//select[@id='manifestForm:workAreas']")))
                time.sleep(1)
                select = Select(select_element)
                # logging.info([op.text for op in select.options])
                if i == 0 and select.options[0].text == 'ALL': continue
                select.select_by_index(i)
                time.sleep(1)

                logging.info("Waiting for the search button to be visible...")
                el = WebDriverWait(driver, 30).until(EC.element_to_be_clickable((By.XPATH, "//input[@id='manifestForm:search']")))
                # scrollTo(el, driver)
                # time.sleep(1)
                el.click()
                time.sleep(1)

                logging.info("Waiting for the load screen...")
                WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//div[@class='mobi-submitnotific-container-hide']")))
                time.sleep(1)

                # Combined Manifest
                c_m = WebDriverWait(driver, 30).until( EC.element_to_be_clickable((By.XPATH, "//em[contains(text(), 'Combined Manifest')]")) )
                time.sleep(1)
                try:
                    c_m.click()
                except:
                    c_m.find_element(By.XPATH, '..').click()

                logging.info("Clicked the tab Combined Manifest...")
                WebDriverWait(driver, 30).until( element_opacity_exists(c_m.find_element(By.XPATH, '../..').get_attribute('id')) )
                time.sleep(1)
                logging.info("Waiting for loading...")
                if driver.find_elements(By.XPATH, "//input[@id='manifestForm:buttonCombinedGenerateExcel']"):
                    driver.find_element(By.XPATH, "//input[@id='manifestForm:buttonCombinedGenerateExcel']").click()
                    checkDownloads(3)
                    time.sleep(3)
                
                # Delivery Manifest
                d_m = WebDriverWait(driver, 30).until( EC.element_to_be_clickable((By.XPATH, "//em[contains(text(), 'Delivery Manifest')]")) )
                time.sleep(1)
                try:
                    d_m.click()
                except:
                    d_m.find_element(By.XPATH, '..').click()

                logging.info("Clicked the tab Delivery Manifest...")
                WebDriverWait(driver, 30).until( element_opacity_exists(d_m.find_element(By.XPATH, '../..').get_attribute('id')) )
                time.sleep(1)
                logging.info("Waiting for loading...")

                if driver.find_elements(By.XPATH, "//input[@id='manifestForm:buttonDeliveryGenerateExcel']"):
                    driver.find_element(By.XPATH, "//input[@id='manifestForm:buttonDeliveryGenerateExcel']").click()
                    checkDownloads(2)
                    time.sleep(3)

                # Pickup manifest
                p_m = WebDriverWait(driver, 30).until( EC.element_to_be_clickable((By.XPATH, "//em[contains(text(), 'Pickup Manifest')]")) )
                time.sleep(1)
                try:
                    p_m.click()
                except:
                    p_m.find_element(By.XPATH, '..').click()
                
                logging.info("Clicked the tab Pickup manifest...")
                WebDriverWait(driver, 30).until( element_opacity_exists(p_m.find_element(By.XPATH, '../..').get_attribute('id')) )
                time.sleep(1)
                logging.info("Waiting for loading...")

                if driver.find_elements(By.XPATH, "//input[@id='manifestForm:buttonGenerateExcel']"):
                    driver.find_element(By.XPATH, "//input[@id='manifestForm:buttonGenerateExcel']").click()
                    checkDownloads(1)
                    time.sleep(3)
            ACTIVE_SECTION_OPTION = 0
        if secion_index <= 1:
            ACTIVE_SECTION = 'Service'
            logging.info("Accessing Service")
            service = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//li[@id='mainTabSettab_2']")))
            time.sleep(2)
            service.click()

            # saStatusForm:date_input
            date_element = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//input[@id='saStatusForm:date_input']")))
            
            script = "document.getElementById('saStatusForm:date_input').value = '{}';".format(SCRAPE_DATE)
            driver.execute_script(script)
            time.sleep(1)

            date_element.send_keys(Keys.ENTER)
            time.sleep(1)
            date_element.send_keys(Keys.ESCAPE)
            time.sleep(2)

            # saStatusForm:search
            search_btn = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//input[@id='saStatusForm:search']")))
            search_btn.click()
            time.sleep(1)

            logging.info("Waiting for the load screen...")
            WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//div[@class='mobi-submitnotific-container-hide']")))
            time.sleep(1)

            WebDriverWait(driver, 30).until( EC.presence_of_element_located((By.XPATH, "//em[contains(text(), 'Work Area Summary')]")) )

            # Service Area Summary
            try:
                s_a = WebDriverWait(driver, 30).until( EC.element_to_be_clickable((By.XPATH, "//em[contains(text(), 'Service Area Summary')]")) )
                time.sleep(1)
                s_a.click()

                WebDriverWait(driver, 30).until( element_opacity_exists(s_a.find_element(By.XPATH, '../..').get_attribute('id')) )
                time.sleep(1)

                if driver.find_elements(By.XPATH, "//input[@id='saStatusForm:buttonServiceAreaSummaryGenerateExcel']"):
                    download_file = os.path.join(DOWNLOAD_FOLDER, "ServiceAreaSummary.xls")
                    if os.path.exists(download_file):
                        os.remove(download_file)
                    driver.find_element(By.XPATH, "//input[@id='saStatusForm:buttonServiceAreaSummaryGenerateExcel']").click()
                    checkDownloads(6)
                    time.sleep(3)
            except Exception as e:
                print(e)

            # Work Area Summary
            w_a = WebDriverWait(driver, 30).until( EC.element_to_be_clickable((By.XPATH, "//em[contains(text(), 'Work Area Summary')]")) )
            time.sleep(1)
            w_a.click()

            WebDriverWait(driver, 30).until( element_opacity_exists(w_a.find_element(By.XPATH, '../..').get_attribute('id')) )
            time.sleep(1)

            if driver.find_elements(By.XPATH, "//input[@id='saStatusForm:buttonGenerateExcel']"):
                download_file = os.path.join(DOWNLOAD_FOLDER, "ServiceAreaStatus.xls")
                if os.path.exists(download_file):
                    os.remove(download_file)
                driver.find_element(By.XPATH, "//input[@id='saStatusForm:buttonGenerateExcel']").click()
                checkDownloads(5)
                time.sleep(3)
            
            ACTIVE_SECTION_OPTION = 0
        if secion_index <= 4:
            ACTIVE_SECTION = 'Daily Service'
            logging.info("Pickup Daily Service")
            iframe = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//iframe[@title='FCC Links']")))

            driver.switch_to.frame(iframe)

            daily_service_week = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//a[contains(text(), 'Daily Service Wk & Vision IBPR')]")))

            daily_service_week.click()

            driver.switch_to.default_content()

            WebDriverWait(driver, 30).until(EC.number_of_windows_to_be(2))

            window_handles = driver.window_handles
            daily_service_week_page_handle = window_handles[-1]
            driver.switch_to.window(daily_service_week_page_handle)

            daily_service_week_page_title = driver.title
            logging.info("Title of the daily_service_week page: " + daily_service_week_page_title)

            date_element = WebDriverWait(driver, 60).until(EC.presence_of_element_located((By.XPATH, "//input[@class='form-control formField-header']")))

            script = "document.getElementsByClassName('form-control formField-header')[0].value = '{}';".format(SCRAPE_DATE)
            driver.execute_script(script)
            time.sleep(1)

            date_element.send_keys(Keys.ENTER)
            time.sleep(1)
            date_element.send_keys(Keys.ESCAPE)
            time.sleep(2)

            select_element = WebDriverWait(driver, 60).until(EC.presence_of_element_located((By.XPATH, "//select[@id='facilitySelect']")))

            total_select_options = len(select_element.find_elements(By.XPATH, "option"))

            # logging.info("Total options:", total_select_options)

            # time.sleep(1000)

            for i in range(option_, getDailyServiceOptions()):
                try:
                    logging.info(f'Selecting option {i}')
                    ACTIVE_SECTION_OPTION = i
                    select_element = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//select[@id='facilitySelect']")))
                    time.sleep(1)
                    select = Select(select_element)

                    select.select_by_index(i)
                    time.sleep(1)

                    driver.find_element(By.XPATH, '//button[@class="selectionButton"]').click()
                    time.sleep(1)

                    try:
                        WebDriverWait(driver, 30).until(EC.invisibility_of_element_located((By.XPATH, "//loading-table-animation/div[@class='cssload-piano']")))

                        if driver.find_elements(By.XPATH, '//img[@class="downloadIcon"]'):
                            driver.find_elements(By.XPATH, '//img[@class="downloadIcon"]')[-1].click()
                            checkDownloads(11)
                            time.sleep(3)
                    except:
                        pass
                except Exception as ee:
                    logging.info(ee)
    except Exception as e:
        logging.info(e)
        driver.quit()
        logging.info("Crashed On: " + str(ACTIVE_SECTION) + ' and ' + str(ACTIVE_SECTION_OPTION))
        writeError(formatted_date, f"Crashed On:{ACTIVE_SECTION} and {ACTIVE_SECTION_OPTION}", "Specific scrape", START_TIME)
        time.sleep(3)
        if retry < 75:
            return main(ACTIVE_SECTION, ACTIVE_SECTION_OPTION, retry+1)
        else:
            logging.info(f'{retry} time retried...')
            try:
                driver.quit()
                closeConnection(CONNECTION)
            except Exception as ee:
                logging.info(ee)
            time.sleep(5)

            CONNECTION, CURSOR = getConnection()

            query = f'UPDATE scraper_config SET scrape_on_progress=0, continue_on_selection="{ACTIVE_SECTION}", continue_on_option={ACTIVE_SECTION_OPTION} LIMIT 1'

            try:
                CURSOR.execute(query)
                CONNECTION.commit()
            except Exception as e:
                logging.info(e)

            success = renameFolder(DOWNLOAD_FOLDER)

            extractDataFromFolder(os.path.basename(DOWNLOAD_FOLDER))

            closeConnection(CONNECTION)

            return False

    driver.quit()
    time.sleep(5)
    success = renameFolder(DOWNLOAD_FOLDER)

    extractDataFromFolder(os.path.basename(DOWNLOAD_FOLDER))

    CONNECTION, CURSOR = getConnection()

    query = f'UPDATE scraper_config SET scrape_on_active=0, continue_on_selection="", continue_on_option=0 LIMIT 1'

    try:
        CURSOR.execute(query)
        CONNECTION.commit()
    except Exception as e:
        logging.info(e)

    closeConnection(CONNECTION)

def scrapeAll(CONNECTION, CURSOR, S_INFO):
    logging.info("Scraping for specific date...")
    query = f'UPDATE scraper_config SET scrape_on_progress=1 LIMIT 1'

    try:
        CURSOR.execute(query)
        CONNECTION.commit()
        logging.info("Updated specific scrape progress...")
    except Exception as e:
        logging.info(e)
    main(S_INFO['continue_on_selection'], S_INFO['continue_on_selection_option'])

if __name__ == "__main__":
    main()
    # main('SCH')