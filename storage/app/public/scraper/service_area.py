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
import shutil
import threading
from datetime import datetime

from rename_files import renameFile
from extract_data import extractDataFromFolder

from webdriver_manager.chrome import ChromeDriverManager
from connections import getConnection, closeConnection, getScrapingConfig, getMainFolder, writeError, isPlatformLinux

# 
import logging
log_folder = os.path.join(getMainFolder(), 'Logs')
if not os.path.exists(log_folder): os.mkdir(log_folder)
log_file = f"service_area_{datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d_%H_%M_%S')}.log"

logging.basicConfig(filename=os.path.join(log_folder, log_file), level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
# 

MAIN_FOLDER = os.path.join(getMainFolder(), 'Excels')

if not os.path.exists(MAIN_FOLDER):
    os.mkdir(MAIN_FOLDER)

current_date = datetime.now()
formatted_date = current_date.strftime("%m-%d-%Y")
START_TIME = time.time()

DOWNLOAD_FOLDER = os.path.join(MAIN_FOLDER, formatted_date)

logging.info(MAIN_FOLDER + " " + DOWNLOAD_FOLDER)

if not os.path.exists(DOWNLOAD_FOLDER):
    os.mkdir(DOWNLOAD_FOLDER)

# Checking table for scraping configuration
CONNECTION, CURSOR = getConnection()

SCRAP_INFO = getScrapingConfig(CONNECTION, CURSOR)
logging.info(SCRAP_INFO)

if not SCRAP_INFO['can_scrape'] or len(SCRAP_INFO['username']) == 0 or len(SCRAP_INFO['password']) == 0:
    logging.info("No permission to scrape as per admin panel or username and/or password not configured on admin panel")
    closeConnection(CONNECTION)
    sys.exit()
else:
    if SCRAP_INFO['scrape_on_active'] and SCRAP_INFO['scrape_on'] and not SCRAP_INFO['scrape_on_progress']: 
        logging.info("Also scraping from specific date...")

        from scrape_particular_date import scrapeAll
        scrapeAll(CONNECTION, CURSOR, SCRAP_INFO)
        # thread = threading.Thread(target=scrapeAll)
        # thread.start()

closeConnection(CONNECTION)

def getDriver():
    options = webdriver.ChromeOptions() 
    options.add_argument("start-maximized")
    # options.binary_location = '/usr/bin/google-chrome'

    if isPlatformLinux(): options.add_argument('--headless=new')
    # options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')

    options.add_argument('--disable-gpu')
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

def scrollTo(el, driver):
    desired_y = (el.size['height'] / 2) + el.location['y']
    current_y = (driver.execute_script('return window.innerHeight') / 2) + driver.execute_script(
    'return window.pageYOffset')
    scroll_y_by = desired_y - current_y
    driver.execute_script("window.scrollBy(0, arguments[0]);", scroll_y_by)

def checkDownloads(file):
    logging.info("Downloading " + file)

def main(retry=0):
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
        username.send_keys(SCRAP_INFO['username'])
        time.sleep(1)
        
        # '8478029#Redd'
        password.send_keys(SCRAP_INFO['password'])
        time.sleep(1)
        
        password.send_keys(Keys.ENTER)
        # time.sleep(3)
        # driver.save_screenshot('./save_screenshot_method.png')
        # logging.info("Screenshot taken")
        WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//a[@id='PT_HOME']")))
        # $x("//a[@id='PT_HOME']")
        # WebDriverWait(driver, 60).until(EC.presence_of_element_located((By.XPATH, "//div[@class='gf_header-welcometext']")))
        # $x("//a[@id='PT_HOME']")

        logging.info("Login successfull!")
        
        iframe = WebDriverWait(driver, 60).until(EC.presence_of_element_located((By.XPATH, "//iframe[@title='FCC Links']")))

        driver.switch_to.frame(iframe)

        customer_connection = WebDriverWait(driver, 60).until(EC.presence_of_element_located((By.XPATH, "//a[contains(text(), 'FedEx Customer Connection')]")))

        customer_connection.click()

        driver.switch_to.default_content()

        WebDriverWait(driver, 60).until(EC.number_of_windows_to_be(2))

        window_handles = driver.window_handles
        customer_connection_page_handle = window_handles[-1]
        driver.switch_to.window(customer_connection_page_handle)

        customer_connection_page_title = driver.title
        logging.info("Title of the customer_connection page: " + customer_connection_page_title)

        WebDriverWait(driver, 60).until(EC.presence_of_element_located((By.XPATH, "//li[@id='mainTabSettab_1']")))
        time.sleep(5)
        
        ACTIVE_SECTION = 'Service'
        service = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//li[@id='mainTabSettab_2']")))
        time.sleep(2)
        service.click()

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
            checkDownloads("Work Area Summary")
            time.sleep(20)
    except Exception as e:
        logging.info(e)
        driver.quit()
        logging.info("Crashed: " + str(e))
        writeError(formatted_date, f"Crashed:{e}", "Service area", START_TIME)
        time.sleep(3)
        if retry < 10:
            return main(retry+1)
        else:
            logging.info(f'{retry} time retried...')
            sys.exit()

    driver.quit()

    service_area_summary = os.path.join(DOWNLOAD_FOLDER, "ServiceAreaSummary.xls")
    service_area_status = os.path.join(DOWNLOAD_FOLDER, "ServiceAreaStatus.xls")

    if os.path.exists(service_area_summary):
        renameFile(os.path.basename(DOWNLOAD_FOLDER), "ServiceAreaSummary.xls", DOWNLOAD_FOLDER)

    if os.path.exists(service_area_status):
        renameFile(os.path.basename(DOWNLOAD_FOLDER), "ServiceAreaStatus.xls", DOWNLOAD_FOLDER)

    extractDataFromFolder(os.path.basename(DOWNLOAD_FOLDER))

if __name__ == "__main__":
    main()