#!/root/Script/myenv/bin/python

import os, requests, json, sys
from bs4 import BeautifulSoup
import csv, re, socket, time
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
from datetime import datetime, timezone

from webdriver_manager.chrome import ChromeDriverManager

from runtime_events import emit_runtime_event
from dsw_package_status import (
    collect_dsw_daily_service,
    collect_dsw_package_status,
    purge_expired_local_package_artifacts,
)

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

runtime_service_date = os.environ.get("FCMS_SERVICE_DATE", "").strip()
INSIGHT_HISTORICAL_MODE = bool(runtime_service_date)

logging.info(
    "Scraping configuration loaded: can_scrape=%s source=%s username_present=%s",
    bool(SCRAP_INFO.get("can_scrape")),
    SCRAP_INFO.get("source", "configured"),
    bool(SCRAP_INFO.get("username")),
)

if INSIGHT_HISTORICAL_MODE:
    try:
        current_date = datetime.strptime(runtime_service_date, "%Y-%m-%d")
    except ValueError as exc:
        closeConnection(CONNECTION)
        raise RuntimeError(
            f"Invalid FCMS_SERVICE_DATE {runtime_service_date!r}; expected YYYY-MM-DD."
        ) from exc

    if not SCRAP_INFO['can_scrape'] or len(SCRAP_INFO['username']) == 0 or len(SCRAP_INFO['password']) == 0:
        logging.info("No permission to scrape or runtime credentials are unavailable")
        closeConnection(CONNECTION)
        sys.exit()

    SCRAPE_DATE = current_date.strftime('%m/%d/%Y')
    logging.info("Insight historical service date: " + SCRAPE_DATE)
else:
    if SCRAP_INFO['scrape_on_active'] and SCRAP_INFO['scrape_on'] and not SCRAP_INFO['scrape_on_progress']:
        if not SCRAP_INFO['can_scrape'] or len(SCRAP_INFO['username']) == 0 or len(SCRAP_INFO['password']) == 0:
            logging.info("No permission to scrape as per admin panel or username and/or password not configured on admin panel")
            closeConnection(CONNECTION)
            sys.exit()

        current_date = SCRAP_INFO['scrape_on']
        SCRAPE_DATE = current_date.strftime('%m/%d/%Y')
        logging.info("Scraping Date: " + SCRAPE_DATE)
    else:
        closeConnection(CONNECTION)
        sys.exit()

closeConnection(CONNECTION)
#

formatted_date = current_date.strftime("%m-%d-%Y")

DOWNLOAD_FOLDER = os.path.join(MAIN_FOLDER, formatted_date)
SESSION_COOKIE_FILE = os.environ.get(
    "FCMS_SESSION_COOKIE_FILE",
    "/tmp/teamoptix-fedex-session.json",
)
PERSIST_BROWSER = os.environ.get(
    "FCMS_PERSIST_BROWSER",
    "0",
).strip().lower() in {"1", "true", "yes", "on"}
CHROME_DEBUGGER_ADDRESS = os.environ.get(
    "FCMS_CHROME_DEBUGGER_ADDRESS",
    "127.0.0.1:9222",
)
PERSIST_ORIGINAL_WINDOW_HANDLES = set()
PERSIST_DSW_WINDOW_HANDLE = None

logging.info(f"{current_date} {formatted_date} {DOWNLOAD_FOLDER}")

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


def recordObservedDownload(artifact_key, lane_key, requested_at):
    candidates = [
        os.path.join(DOWNLOAD_FOLDER, filename)
        for filename in os.listdir(DOWNLOAD_FOLDER)
        if os.path.isfile(os.path.join(DOWNLOAD_FOLDER, filename))
        and os.path.getmtime(os.path.join(DOWNLOAD_FOLDER, filename))
        >= requested_at - 1
        and os.path.splitext(filename)[1].lower() in {".xls", ".xlsx"}
    ]
    if not candidates:
        return
    downloaded_path = max(candidates, key=os.path.getmtime)
    event_common = {
        "artifact_key": artifact_key,
        "lane_key": lane_key,
        "filename": os.path.basename(downloaded_path),
    }
    emit_runtime_event(
        "SOURCE_REQUESTED",
        "SOURCE",
        occurred_at=datetime.fromtimestamp(
            requested_at, timezone.utc
        ).isoformat().replace("+00:00", "Z"),
        **event_common,
    )
    emit_runtime_event(
        "DOWNLOAD_COMPLETED",
        "DOWNLOAD",
        occurred_at=datetime.fromtimestamp(
            os.path.getmtime(downloaded_path), timezone.utc
        ).isoformat().replace("+00:00", "Z"),
        **event_common,
    )

def getDriver():
    global PERSIST_DSW_WINDOW_HANDLE, PERSIST_ORIGINAL_WINDOW_HANDLES
    if isPlatformLinux() and PERSIST_BROWSER:
        try:
            debugger_host, debugger_port = CHROME_DEBUGGER_ADDRESS.rsplit(":", 1)
            with socket.create_connection(
                (debugger_host, int(debugger_port)),
                timeout=1,
            ):
                pass
            attach_options = webdriver.ChromeOptions()
            attach_options.binary_location = '/usr/bin/google-chrome-stable'
            attach_options.add_experimental_option(
                "debuggerAddress",
                CHROME_DEBUGGER_ADDRESS,
            )
            attached_driver = webdriver.Chrome(options=attach_options)
            attached_driver.execute_cdp_cmd(
                "Page.setDownloadBehavior",
                {
                    "behavior": "allow",
                    "downloadPath": DOWNLOAD_FOLDER,
                },
            )
            PERSIST_ORIGINAL_WINDOW_HANDLES = set(
                attached_driver.window_handles
            )
            for handle in attached_driver.window_handles:
                attached_driver.switch_to.window(handle)
                current_url = attached_driver.current_url
                if (
                    attached_driver.title == "AutoDSW"
                    or "/mgba/dsw" in current_url
                ):
                    PERSIST_DSW_WINDOW_HANDLE = handle
                    logging.info(
                        "Reusing existing AutoDSW window for historical collection"
                    )
                    return attached_driver
            attached_driver.switch_to.new_window("tab")
            logging.info(
                "Attached historical collection to persistent FedEx browser session"
            )
            return attached_driver
        except Exception as error:
            logging.exception(
                "Persistent FedEx browser attach unavailable: %s",
                error,
            )
            emit_runtime_event(
                "COLLECTION_FAILED",
                "BROWSER_STARTUP",
                lane_key="DSW",
                metadata={
                    "exception_type": type(error).__name__,
                    "message": str(error)[:500]
                    or "Persistent browser attachment failed.",
                },
            )
            raise

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


def restoreSessionCookies(driver):
    if not os.path.exists(SESSION_COOKIE_FILE):
        return 0

    try:
        with open(SESSION_COOKIE_FILE, "r", encoding="utf-8") as cookie_file:
            cookies = json.load(cookie_file)
        if not isinstance(cookies, list) or not cookies:
            return 0
        driver.execute_cdp_cmd("Network.setCookies", {"cookies": cookies})
        return len(cookies)
    except Exception as error:
        logging.info("FedEx session cookie restore skipped: %s", error)
        return 0


def persistSessionCookies(driver):
    try:
        raw_cookies = driver.execute_cdp_cmd(
            "Network.getAllCookies",
            {},
        ).get("cookies", [])
        cookies = []
        for cookie in raw_cookies:
            if not isinstance(cookie, dict):
                continue
            allowed = {
                key: cookie[key]
                for key in (
                    "name",
                    "value",
                    "domain",
                    "path",
                    "secure",
                    "httpOnly",
                    "sameSite",
                    "expires",
                )
                if key in cookie
            }
            if not allowed.get("name") or "value" not in allowed:
                continue
            if allowed.get("sameSite") not in (
                None,
                "Strict",
                "Lax",
                "None",
            ):
                allowed.pop("sameSite", None)
            if float(allowed.get("expires", 0) or 0) <= 0:
                allowed.pop("expires", None)
            cookies.append(allowed)
        temporary = f"{SESSION_COOKIE_FILE}.{os.getpid()}.tmp"
        with open(temporary, "w", encoding="utf-8") as cookie_file:
            json.dump(cookies, cookie_file)
        os.chmod(temporary, 0o600)
        os.replace(temporary, SESSION_COOKIE_FILE)
    except Exception as error:
        logging.info("FedEx session cookie persistence skipped: %s", error)


def authenticateDriver(driver):
    init_url = "https://mybizaccount.fedex.com/my.policy"
    restored_cookie_count = restoreSessionCookies(driver)
    driver.get(init_url)
    logging.info("Visiting https://mybizaccount.fedex.com/my.policy")

    def authentication_entry_ready(current_driver):
        return (
            current_driver.find_elements(By.XPATH, "//a[@id='PT_HOME']")
            or current_driver.find_elements(
                By.XPATH,
                "//input[@class='credentials_input_submit']",
            )
            or current_driver.find_elements(
                By.XPATH,
                '//input[@name="identifier"]',
            )
        )

    WebDriverWait(driver, 30).until(authentication_entry_ready)
    if driver.find_elements(By.XPATH, "//a[@id='PT_HOME']"):
        logging.info("FedEx session reused for historical collection")
        persistSessionCookies(driver)
        emit_runtime_event(
            "SESSION_REUSED",
            "AUTHENTICATION",
            metadata={
                "restored_cookie_count": restored_cookie_count,
                "historical": True,
            },
        )
        return

    if not driver.find_elements(By.XPATH, '//input[@name="identifier"]'):
        btn = WebDriverWait(driver, 20).until(
            EC.presence_of_element_located(
                (By.XPATH, "//input[@class='credentials_input_submit']")
            )
        )
        btn.click()

    username = WebDriverWait(driver, 20).until(
        EC.presence_of_element_located(
            (By.XPATH, '//input[@name="identifier"]')
        )
    )
    logging.info("On login page....")
    emit_runtime_event("AUTH_ATTEMPTED", "AUTHENTICATION")
    username.send_keys(SCRAP_INFO['username'])

    continue_candidates = [
        "//input[@type='submit']",
        "//button[@type='submit']",
        "//input[contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'next')]",
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'next')]",
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'continue')]",
    ]
    for candidate in continue_candidates:
        try:
            driver.find_element(By.XPATH, candidate).click()
            break
        except Exception:
            pass

    password = WebDriverWait(driver, 25).until(
        EC.presence_of_element_located(
            (
                By.XPATH,
                '//input[@name="credentials.passcode"]'
                ' | //input[@name="password"]'
                ' | //input[@type="password"]',
            )
        )
    )
    password.send_keys(SCRAP_INFO['password'])
    password.send_keys(Keys.ENTER)
    WebDriverWait(driver, 30).until(
        EC.presence_of_element_located((By.XPATH, "//a[@id='PT_HOME']"))
    )
    logging.info("Login successful!")
    persistSessionCookies(driver)
    emit_runtime_event("AUTH_COMPLETED", "AUTHENTICATION")


def releaseDriver(driver):
    if not PERSIST_BROWSER:
        driver.quit()
        return

    try:
        for handle in list(driver.window_handles):
            if handle in PERSIST_ORIGINAL_WINDOW_HANDLES:
                continue
            try:
                driver.switch_to.window(handle)
                driver.close()
            except Exception as error:
                logging.info(
                    "Historical collection window cleanup skipped: %s",
                    error,
                )
        remaining_handles = list(driver.window_handles)
        if remaining_handles:
            preferred_handle = next(
                (
                    handle
                    for handle in remaining_handles
                    if handle in PERSIST_ORIGINAL_WINDOW_HANDLES
                ),
                remaining_handles[0],
            )
            driver.switch_to.window(preferred_handle)
        service = getattr(driver, "service", None)
        if service is not None:
            service.stop()
        logging.info(
            "Detached historical WebDriver; persistent Chrome remains available"
        )
    except Exception as error:
        logging.info(
            "Persistent historical WebDriver detach failed: %s",
            error,
        )

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

def requested_manifest_types():
    raw_types = os.environ.get("FCMS_MANIFEST_TYPES", "").strip().lower()
    requested = {
        value.strip()
        for value in raw_types.split(",")
        if value.strip()
    }

    if not requested:
        requested = {"combined", "delivery", "pickup"}

    if os.environ.get("FCMS_SKIP_COMBINED", "0").strip().lower() in {"1", "true", "yes", "on"}:
        requested.discard("combined")

    return requested

REQUESTED_MANIFEST_TYPES = requested_manifest_types()

def should_download_manifest(manifest_type):
    return manifest_type in REQUESTED_MANIFEST_TYPES

def scrollTo(el, driver):
    desired_y = (el.size['height'] / 2) + el.location['y']
    current_y = (driver.execute_script('return window.innerHeight') / 2) + driver.execute_script(
    'return window.pageYOffset')
    scroll_y_by = desired_y - current_y
    driver.execute_script("window.scrollBy(0, arguments[0]);", scroll_y_by)

def main(section_='', option_=0, retry=1):
    global SECTION_LIST, ACTIVE_SECTION, ACTIVE_SECTION_OPTION
    purge_expired_local_package_artifacts(MAIN_FOLDER)
    try:
        driver = getDriver()
    except Exception:
        logging.exception("Historical collection browser startup failed")
        raise
    logging.info("Driver loaded...")
    try:
        if PERSIST_DSW_WINDOW_HANDLE:
            driver.switch_to.window(PERSIST_DSW_WINDOW_HANDLE)
            logging.info(
                "FedEx AutoDSW session reused for historical collection"
            )
            emit_runtime_event(
                "SESSION_REUSED",
                "AUTHENTICATION",
                metadata={
                    "historical": True,
                    "persistent_dsw_window": True,
                },
            )
        else:
            authenticateDriver(driver)

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
                if should_download_manifest("combined"):
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
                else:
                    logging.info("Skipping Combined Manifest by request payload")

                # Delivery Manifest
                if should_download_manifest("delivery"):
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
                else:
                    logging.info("Skipping Delivery Manifest by request payload")

                # Pickup manifest
                if should_download_manifest("pickup"):
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
                else:
                    logging.info("Skipping Pickup Manifest by request payload")
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
            if PERSIST_DSW_WINDOW_HANDLE:
                daily_service_week_page_handle = PERSIST_DSW_WINDOW_HANDLE
                driver.switch_to.window(daily_service_week_page_handle)
            else:
                iframe = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//iframe[@title='FCC Links']")))

                driver.switch_to.frame(iframe)

                daily_service_week = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//a[contains(text(), 'Daily Service Wk & Vision IBPR')]")))

                existing_window_handles = set(driver.window_handles)
                daily_service_week.click()

                driver.switch_to.default_content()

                WebDriverWait(driver, 30).until(
                    lambda current_driver:
                        len(set(current_driver.window_handles) - existing_window_handles) > 0
                )
                daily_service_week_page_handle = next(
                    handle
                    for handle in driver.window_handles
                    if handle not in existing_window_handles
                )
                driver.switch_to.window(daily_service_week_page_handle)

            daily_service_week_page_title = driver.title
            logging.info("Title of the daily_service_week page: " + daily_service_week_page_title)

            date_element = WebDriverWait(driver, 60).until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//input[contains(@class, 'formField-header')]")
                )
            )

            logging.info(
                "DSW date before selection: %r; requested: %s",
                date_element.get_attribute("value"),
                SCRAPE_DATE,
            )

            date_element.click()
            date_element.send_keys(Keys.CONTROL, "a")
            date_element.send_keys(SCRAPE_DATE)
            date_element.send_keys(Keys.TAB)

            WebDriverWait(driver, 15).until(
                lambda active_driver: active_driver.find_element(
                    By.XPATH,
                    "//input[contains(@class, 'formField-header')]",
                ).get_attribute("value").strip() == SCRAPE_DATE
            )

            date_element = driver.find_element(
                By.XPATH,
                "//input[contains(@class, 'formField-header')]",
            )
            logging.info(
                "DSW date committed to page: %r",
                date_element.get_attribute("value"),
            )
            time.sleep(2)

            select_element = WebDriverWait(driver, 60).until(EC.presence_of_element_located((By.XPATH, "//select[@id='facilitySelect']")))

            total_select_options = len(select_element.find_elements(By.XPATH, "option"))

            # logging.info("Total options:", total_select_options)

            # time.sleep(1000)

            required_download_count = 0
            facility_errors = []
            for i in range(option_, total_select_options):
                try:
                    logging.info(f'Selecting option {i}')
                    ACTIVE_SECTION_OPTION = i
                    select_element = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//select[@id='facilitySelect']")))
                    time.sleep(1)
                    select = Select(select_element)

                    select.select_by_index(i)
                    selected_facility = select.first_selected_option
                    facility_identity = (
                        selected_facility.get_attribute("value")
                        or selected_facility.text
                        or f"option-{i}"
                    ).strip()
                    time.sleep(1)

                    driver.find_element(By.XPATH, '//button[@class="selectionButton"]').click()
                    time.sleep(1)

                    WebDriverWait(driver, 30).until(
                        EC.invisibility_of_element_located(
                            (
                                By.XPATH,
                                "//loading-table-animation/"
                                "div[@class='cssload-piano']",
                            )
                        )
                    )
                    collect_dsw_daily_service(
                        driver,
                        download_folder=DOWNLOAD_FOLDER,
                        facility_identity=facility_identity,
                    )
                    required_download_count += 1

                    collect_dsw_package_status(
                        driver,
                        dsw_window_handle=daily_service_week_page_handle,
                        download_folder=DOWNLOAD_FOLDER,
                        facility_identity=facility_identity,
                        service_date=current_date.strftime("%Y-%m-%d"),
                    )
                except Exception as ee:
                    logging.exception(
                        "DSW facility option %s failed: %s",
                        i,
                        ee,
                    )
                    facility_errors.append(
                        f"option {i}: {type(ee).__name__}: {ee}"
                    )
            if required_download_count == 0:
                raise RuntimeError(
                    "No DSW Daily Service workbook was downloaded. "
                    + " | ".join(facility_errors[:3])
                )
    except Exception as e:
        logging.info(e)
        releaseDriver(driver)
        logging.info("Crashed On: " + str(ACTIVE_SECTION) + ' and ' + str(ACTIVE_SECTION_OPTION))
        writeError(formatted_date, f"Crashed On:{ACTIVE_SECTION} and {ACTIVE_SECTION_OPTION}", "Specific scrape", START_TIME)
        time.sleep(3)
        max_retries = int(os.environ.get("FCMS_MAX_RETRIES", "0"))
        if retry < max_retries:
            return main(ACTIVE_SECTION, ACTIVE_SECTION_OPTION, retry+1)
        else:
            logging.info(
                "%s retries attempted; max_retries=%s. exiting one-shot run.",
                retry,
                max_retries,
            )
            try:
                releaseDriver(driver)
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

            logging.info(
                "Collection stopped after source failure; downloaded bytes "
                "remain available for database handoff."
            )

            closeConnection(CONNECTION)

            return False

    releaseDriver(driver)
    time.sleep(5)
    logging.info(
        "Collection complete; opaque artifacts are ready for database "
        "handoff and ingestion-owned validation."
    )

    if not INSIGHT_HISTORICAL_MODE:
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
    outcome = main("Daily Service" if INSIGHT_HISTORICAL_MODE else "")
    if outcome is False:
        sys.exit(1)
    # main('SCH')
