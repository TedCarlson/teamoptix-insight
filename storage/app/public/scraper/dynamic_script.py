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
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
from sys import platform
import shutil
import socket
import threading
from datetime import datetime, timezone

# from webdriver_manager.chrome import ChromeDriverManager

from rename_files import renameFolder, renameDownloadedManifest
from runtime_events import emit_runtime_event
from extract_data import extractDataFromFolder
from dsw_package_status import (
    collect_dsw_package_status,
    purge_expired_local_package_artifacts,
)

from connections import getConnection, closeConnection, getScrapingConfig, getMainFolder, writeError, isPlatformLinux, getDailyServiceOptions
# if platform == "linux" or platform == "linux2":
#     chrome_driver = getMainFolder() + "/chromedriver"
# elif platform == "win32":
#     chrome_driver = getMainFolder() + "\chromedriver.exe"
# else:
#     chrome_driver = getMainFolder() + "/chromedriver"

#
import logging
log_folder = os.path.join(getMainFolder(), 'Logs')
if not os.path.exists(log_folder): os.mkdir(log_folder)
log_file = f"daily_scraper_{datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d_%H_%M_%S')}.log"

logging.basicConfig(filename=os.path.join(log_folder, log_file), level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
#
MAIN_FOLDER = os.path.join(getMainFolder(), 'Excels')

if not os.path.exists(MAIN_FOLDER):
    os.mkdir(MAIN_FOLDER)

current_date = datetime.now()
formatted_date = current_date.strftime("%m-%d-%Y")

DOWNLOAD_FOLDER = os.path.join(MAIN_FOLDER, formatted_date)
START_TIME = time.time()
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

# Checking table for scraping configuration
CONNECTION, CURSOR = getConnection()

SCRAP_INFO = getScrapingConfig(CONNECTION, CURSOR)

if not SCRAP_INFO['can_scrape'] or len(SCRAP_INFO['username']) == 0 or len(SCRAP_INFO['password']) == 0:
    logging.info("No permission to scrape as per admin panel or username and/or password not configured on admin panel")
    closeConnection(CONNECTION)
    sys.exit()

closeConnection(CONNECTION)

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
    logging.info("Downloading " + FOLDERS[index])
    # Legacy folder routing remains disabled because Chrome downloads directly
    # into the service-date folder configured in getDriver().
    # thread = threading.Thread(target=checkDownloadsHelper, args=(index, ))
    # thread.start()


def downloadSnapshot():
    return {
        str(os.path.realpath(path))
        for path in [
            os.path.join(DOWNLOAD_FOLDER, filename)
            for filename in os.listdir(DOWNLOAD_FOLDER)
        ]
        if os.path.isfile(path)
        and not os.path.basename(path).startswith(".")
        and os.path.splitext(path)[1].lower() in {".xls", ".xlsx"}
    }


def waitForCompletedDownload(before, timeout_seconds=45):
    deadline = time.time() + timeout_seconds
    last_sizes = {}
    first_seen_at = None

    while time.time() < deadline:
        active_downloads = [
            filename
            for filename in os.listdir(DOWNLOAD_FOLDER)
            if filename.endswith(".crdownload")
        ]

        candidates = []

        for filename in os.listdir(DOWNLOAD_FOLDER):
            path = os.path.join(DOWNLOAD_FOLDER, filename)

            if not os.path.isfile(path):
                continue

            if filename.startswith("."):
                continue

            if os.path.splitext(filename)[1].lower() not in {".xls", ".xlsx"}:
                continue

            if str(os.path.realpath(path)) not in before:
                candidates.append(path)

        if candidates and first_seen_at is None:
            first_seen_at = time.time()

        candidates.sort(
            key=lambda candidate: os.path.getmtime(candidate),
            reverse=True,
        )

        for candidate in candidates:
            size = os.path.getsize(candidate)

            if size > 0 and last_sizes.get(candidate) == size:
                return candidate, first_seen_at or time.time()

            last_sizes[candidate] = size

        if not active_downloads and candidates:
            time.sleep(0.5)
        else:
            time.sleep(0.25)

    raise RuntimeError(
        f"Timed out waiting for manifest download in {DOWNLOAD_FOLDER}"
    )


def finalizeManifestDownload(before, expected_type, requested_at):
    downloaded_path, source_ready_at = waitForCompletedDownload(before)

    identification_started_at = time.time()
    renamed_path, metadata = renameDownloadedManifest(
        downloaded_path,
        expected_type=expected_type,
    )

    logging.info(
        "Manifest canonicalized "
        + json.dumps(
            {
                "expected_type": expected_type,
                "source_download_filename": metadata.get(
                    "source_download_filename"
                ),
                "canonical_filename": os.path.basename(renamed_path),
                "service_date": metadata.get("service_date_compact"),
                "service_area": metadata.get("service_area"),
                "work_area": metadata.get("work_area"),
            },
            sort_keys=True,
        )
    )

    artifact_key = {
        "combined": "COMBINED_MANIFEST",
        "delivery": "DELIVERY_MANIFEST",
        "pickup": "PICKUP_MANIFEST",
    }[expected_type]
    lane_key = {
        "combined": "FCC_COMBINED_MANIFESTS",
        "delivery": "FCC_DELIVERY_MANIFESTS",
        "pickup": "FCC_PICKUP_MANIFESTS",
    }[expected_type]
    event_common = {
        "artifact_key": artifact_key,
        "lane_key": lane_key,
        "route_identity": metadata.get("work_area"),
        "filename": os.path.basename(renamed_path),
    }
    emit_runtime_event(
        "ARTIFACT_IDENTIFICATION_STARTED",
        "ARTIFACT_IDENTIFICATION",
        occurred_at=datetime.fromtimestamp(
            identification_started_at, timezone.utc
        ).isoformat().replace("+00:00", "Z"),
        **event_common,
    )
    emit_runtime_event(
        "ARTIFACT_IDENTIFICATION_COMPLETED",
        "ARTIFACT_IDENTIFICATION",
        duration_ms=int((time.time() - identification_started_at) * 1000),
        metadata={
            "source_download_filename": metadata.get(
                "source_download_filename"
            ),
            "canonical_filename": os.path.basename(renamed_path),
            "header_authoritative": metadata.get(
                "header_authoritative",
                False,
            ),
        },
        **event_common,
    )
    emit_runtime_event(
        "SOURCE_REQUESTED",
        "SOURCE",
        occurred_at=datetime.fromtimestamp(
            requested_at, timezone.utc
        ).isoformat().replace("+00:00", "Z"),
        **event_common,
    )
    emit_runtime_event(
        "SOURCE_READY",
        "SOURCE",
        occurred_at=datetime.fromtimestamp(
            source_ready_at, timezone.utc
        ).isoformat().replace("+00:00", "Z"),
        **event_common,
    )
    emit_runtime_event(
        "DOWNLOAD_STARTED",
        "DOWNLOAD",
        occurred_at=datetime.fromtimestamp(
            source_ready_at, timezone.utc
        ).isoformat().replace("+00:00", "Z"),
        **event_common,
    )
    emit_runtime_event("DOWNLOAD_COMPLETED", "DOWNLOAD", **event_common)

    return renamed_path


def finalizeSimpleDownload(
    before,
    artifact_key,
    lane_key,
    requested_at,
):
    downloaded_path, source_ready_at = waitForCompletedDownload(before)
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
        "SOURCE_READY",
        "SOURCE",
        occurred_at=datetime.fromtimestamp(
            source_ready_at, timezone.utc
        ).isoformat().replace("+00:00", "Z"),
        **event_common,
    )
    emit_runtime_event(
        "DOWNLOAD_STARTED",
        "DOWNLOAD",
        occurred_at=datetime.fromtimestamp(
            source_ready_at, timezone.utc
        ).isoformat().replace("+00:00", "Z"),
        **event_common,
    )
    emit_runtime_event("DOWNLOAD_COMPLETED", "DOWNLOAD", **event_common)
    return downloaded_path


def recordObservedDownload(
    artifact_key,
    lane_key,
    requested_at,
):
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
            logging.info("Attached to persistent FedEx browser session")
            return attached_driver
        except Exception as error:
            logging.info("Persistent FedEx browser attach unavailable: %s", error)

    options = webdriver.ChromeOptions()
    options.add_argument("start-maximized")
    if isPlatformLinux():
        options.binary_location = '/usr/bin/google-chrome-stable'

    if isPlatformLinux():
        options.add_argument('--headless=new')
        options.add_argument(
            '--remote-debugging-port=9222'
            if PERSIST_BROWSER
            else '--remote-debugging-port=0'
        )
        chrome_profile_dir = os.environ.get(
            "FCMS_CHROME_PROFILE_DIR",
            "/tmp/teamoptix-selenium-chrome",
        )
        options.add_argument(f'--user-data-dir={chrome_profile_dir}')
        if PERSIST_BROWSER:
            options.add_experimental_option('detach', True)
    # options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-setuid-sandbox')
    options.add_argument('--disable-extensions')
    options.add_argument('--disable-software-rasterizer')

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

    driver = webdriver.Chrome(options=options)
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

def should_run_section(section_name):
    # SCH PU Mgmt is intentionally excluded from Insight Last Look / normal sweeps.
    # It is an internal operational workflow and not currently useful for Insight ingestion.
    if section_name == "SCH":
        return os.environ.get("FCMS_ENABLE_SCH", "0") == "1"

    target_sections = [
        section.strip()
        for section in os.environ.get("FCMS_TARGET_SECTIONS", "").split(",")
        if section.strip()
    ]

    if target_sections:
        return section_name in target_sections

    return True

def scrollTo(el, driver):
    desired_y = (el.size['height'] / 2) + el.location['y']
    current_y = (driver.execute_script('return window.innerHeight') / 2) + driver.execute_script(
    'return window.pageYOffset')
    scroll_y_by = desired_y - current_y
    driver.execute_script("window.scrollBy(0, arguments[0]);", scroll_y_by)

def restoreSessionCookies(driver):
    if not os.path.exists(SESSION_COOKIE_FILE):
        return 0

    try:
        with open(SESSION_COOKIE_FILE, "r", encoding="utf-8") as cookie_file:
            cookies = json.load(cookie_file)
        if not isinstance(cookies, list) or not cookies:
            return 0

        # FedEx session state spans its application and identity-provider
        # domains. CDP can restore all of those cookies before navigation;
        # Selenium's add_cookie API is limited to the current domain.
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
            if allowed.get("sameSite") not in (None, "Strict", "Lax", "None"):
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
                By.XPATH, "//input[@class='credentials_input_submit']"
            )
            or current_driver.find_elements(
                By.XPATH, '//input[@name="identifier"]'
            )
        )

    # Chrome uses a durable runner profile. A successful Operations Pulse
    # session is therefore reused across completion-driven cycles instead of
    # submitting the username and password again for every report lane.
    try:
        WebDriverWait(driver, 20).until(authentication_entry_ready)
    except TimeoutException:
        # A stale FedEx session can leave the landing page in neither an
        # authenticated nor a login-ready state. Discard only that cached
        # session and fall back to the normal credential flow. The durable
        # Chrome profile may contain session state even when FedEx exposes no
        # serializable cookies, so the fallback must not depend on the cookie
        # file containing entries.
        logging.info("Cached FedEx session was not accepted; retrying fresh authentication")
        driver.delete_all_cookies()
        try:
            os.remove(SESSION_COOKIE_FILE)
        except FileNotFoundError:
            pass
        driver.get("about:blank")
        driver.get(init_url)
        WebDriverWait(driver, 30).until(authentication_entry_ready)

    if driver.find_elements(By.XPATH, "//a[@id='PT_HOME']"):
        logging.info("FedEx session reused")
        persistSessionCookies(driver)
        emit_runtime_event(
            "SESSION_REUSED",
            "AUTHENTICATION",
            metadata={"restored_cookie_count": restored_cookie_count},
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
    time.sleep(1)

    username.send_keys(SCRAP_INFO['username'])
    time.sleep(1)

    continue_candidates = [
        "//input[@type='submit']",
        "//button[@type='submit']",
        "//input[contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'next')]",
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'next')]",
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'continue')]",
    ]

    for candidate in continue_candidates:
        try:
            el = driver.find_element(By.XPATH, candidate)
            el.click()
            logging.info("Clicked username continue...")
            break
        except Exception:
            pass

    try:
        password = WebDriverWait(driver, 25).until(
            EC.presence_of_element_located(
                (
                    By.XPATH,
                    '//input[@name="credentials.passcode"] | '
                    '//input[@name="password"] | //input[@type="password"]',
                )
            )
        )
    except TimeoutException:
        visible_inputs = [
            {
                "name": element.get_attribute("name"),
                "type": element.get_attribute("type"),
            }
            for element in driver.find_elements(By.CSS_SELECTOR, "input")
        ]
        logging.info(
            "PurpleID password challenge unavailable url=%s title=%s inputs=%s",
            driver.current_url,
            driver.title,
            visible_inputs,
        )
        raise
    time.sleep(1)
    password.send_keys(SCRAP_INFO['password'])
    time.sleep(1)
    password.send_keys(Keys.ENTER)

    WebDriverWait(driver, 30).until(
        EC.presence_of_element_located((By.XPATH, "//a[@id='PT_HOME']"))
    )
    logging.info("Login successfull!")
    persistSessionCookies(driver)
    emit_runtime_event("AUTH_COMPLETED", "AUTHENTICATION")


def retainOnlyWindow(driver, keep_handle):
    for handle in list(driver.window_handles):
        if handle == keep_handle:
            continue
        try:
            driver.switch_to.window(handle)
            driver.close()
        except Exception as error:
            logging.info("Stale FedEx window cleanup skipped: %s", error)
    driver.switch_to.window(keep_handle)
    driver.switch_to.default_content()


def main(section_='', option_=0, retry=1):
    global SECTION_LIST, ACTIVE_SECTION, ACTIVE_SECTION_OPTION
    purge_expired_local_package_artifacts(MAIN_FOLDER)
    driver = getDriver()
    home_page_handle = None
    logging.info("Driver loaded...")
    try:
        authenticateDriver(driver)
        home_page_handle = driver.current_window_handle
        retainOnlyWindow(driver, home_page_handle)

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

        needs_fcc_window = (
            should_run_section('P&D')
            or should_run_section('Service')
            or should_run_section('Pickup')
            or should_run_section('SCH')
        )

        if secion_index <= 3 and needs_fcc_window:
            iframe = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//iframe[@title='FCC Links']")))

            driver.switch_to.frame(iframe)

            customer_connection = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//a[contains(text(), 'FedEx Customer Connection')]")))

            # logging.info(customer_connection.get_attribute('href'))

            existing_window_handles = set(driver.window_handles)
            customer_connection.click()

            driver.switch_to.default_content()

            WebDriverWait(driver, 30).until(
                lambda current_driver:
                    len(
                        set(current_driver.window_handles)
                        - existing_window_handles
                    ) > 0
            )
            customer_connection_page_handle = next(
                handle
                for handle in driver.window_handles
                if handle not in existing_window_handles
            )
            driver.switch_to.window(customer_connection_page_handle)

            customer_connection_page_title = driver.title
            logging.info("Title of the customer_connection page: " + customer_connection_page_title)

            WebDriverWait(driver, 60).until(EC.presence_of_element_located((By.XPATH, "//li[@id='mainTabSettab_1']")))
            time.sleep(5)

        if secion_index <= 0 and should_run_section('P&D'):
            # P&D Mainifests
            ACTIVE_SECTION = 'P&D'
            logging.info("Accessing P&D")
            p_d = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//li[@id='mainTabSettab_1']")))
            time.sleep(2)
            p_d.click()

            select_element = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//select[@id='manifestForm:workAreas']")))

            total_select_options = len(select_element.find_elements(By.XPATH, 'option'))

            for i in range(option_, total_select_options):
                if i == 0: continue
                logging.info(f'Selecting option {i}')
                ACTIVE_SECTION_OPTION = i
                select_element = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//select[@id='manifestForm:workAreas']")))
                time.sleep(1)
                select = Select(select_element)

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
                        before_download = downloadSnapshot()
                        requested_at = time.time()
                        driver.find_element(By.XPATH, "//input[@id='manifestForm:buttonCombinedGenerateExcel']").click()
                        finalizeManifestDownload(before_download, "combined", requested_at)
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
                        before_download = downloadSnapshot()
                        requested_at = time.time()
                        driver.find_element(By.XPATH, "//input[@id='manifestForm:buttonDeliveryGenerateExcel']").click()
                        finalizeManifestDownload(before_download, "delivery", requested_at)
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
                        before_download = downloadSnapshot()
                        requested_at = time.time()
                        driver.find_element(By.XPATH, "//input[@id='manifestForm:buttonGenerateExcel']").click()
                        finalizeManifestDownload(before_download, "pickup", requested_at)
                else:
                    logging.info("Skipping Pickup Manifest by request payload")
            ACTIVE_SECTION_OPTION = 0
        if secion_index <= 1 and should_run_section('Service'):
            ACTIVE_SECTION = 'Service'
            logging.info("Accessing Service")
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
                before_download = downloadSnapshot()
                requested_at = time.time()
                driver.find_element(By.XPATH, "//input[@id='saStatusForm:buttonGenerateExcel']").click()
                finalizeSimpleDownload(
                    before_download,
                    "FCC_SERVICE_AREA_STATUS",
                    "FCC_WORK_AREA_SUMMARY",
                    requested_at,
                )

            ACTIVE_SECTION_OPTION = 0
        if secion_index <= 2 and should_run_section('Pickup'):
            ACTIVE_SECTION = 'Pickup'
            logging.info("Pickup")
            pickup = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//li[@id='mainTabSettab_3']")))
            time.sleep(2)
            pickup.click()

            if driver.find_elements(By.XPATH, "//input[@id='saPickupAlertsForm:buttonGenerateExcel']"):
                driver.find_element(By.XPATH, "//input[@id='saPickupAlertsForm:buttonGenerateExcel']").click()
                checkDownloads(7)
                time.sleep(3)
            ACTIVE_SECTION_OPTION = 0
        if secion_index <= 3 and should_run_section('SCH'):
            ACTIVE_SECTION = 'SCH'
            logging.info("Pickup SCH")
            sch = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//li[@id='mainTabSettab_4']")))
            time.sleep(2)
            sch.click()

            select_element = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//select[@id='scheduledPickupManagementForm:scheduledPickupManagementWorkArea']")))

            total_select_options = len(select_element.find_elements(By.XPATH, 'option'))

            for i in range(option_, total_select_options):
                if i == 0: continue
                logging.info(f'Selecting option {i}')
                ACTIVE_SECTION_OPTION = i
                select_element = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//select[@id='scheduledPickupManagementForm:scheduledPickupManagementWorkArea']")))
                time.sleep(1)
                select = Select(select_element)

                select.select_by_index(i)
                time.sleep(1)

                driver.find_element(By.XPATH, "//input[@id='scheduledPickupManagementForm:search']").click()
                time.sleep(1)

                # Pickup Assignments
                p_a = WebDriverWait(driver, 30).until( EC.element_to_be_clickable((By.XPATH, "//em[contains(text(), 'Pickup Assignments')]")) )
                time.sleep(1)
                p_a.click()

                WebDriverWait(driver, 30).until( element_opacity_exists(p_a.find_element(By.XPATH, '../..').get_attribute('id')) )
                time.sleep(1)

                if driver.find_elements(By.XPATH, "//input[@id='scheduledPickupManagementForm:pickupReassignmentsButtonGenerateExcel']"):
                    driver.find_element(By.XPATH, "//input[@id='scheduledPickupManagementForm:pickupReassignmentsButtonGenerateExcel']").click()
                    checkDownloads(10)
                    time.sleep(3)

                # Reorder PU Listings
                r_p_l = WebDriverWait(driver, 30).until( EC.element_to_be_clickable((By.XPATH, "//em[contains(text(), 'Reorder PU Listings')]")) )
                time.sleep(1)
                r_p_l.click()

                WebDriverWait(driver, 30).until( element_opacity_exists(r_p_l.find_element(By.XPATH, '../..').get_attribute('id')) )
                time.sleep(1)

                if driver.find_elements(By.XPATH, "//input[@id='scheduledPickupManagementForm:reorderPickupListingsButtonGenerateExcel']"):
                    driver.find_element(By.XPATH, "//input[@id='scheduledPickupManagementForm:reorderPickupListingsButtonGenerateExcel']").click()
                    checkDownloads(9)
                    time.sleep(3)
            driver.close()
            ACTIVE_SECTION_OPTION = 0
        if secion_index <= 4 and should_run_section('Daily Service'):
            ACTIVE_SECTION = 'Daily Service'
            logging.info("Pickup Daily Service")
            for handle in driver.window_handles:
                if handle == home_page_handle:
                    continue
                driver.switch_to.window(handle)
                driver.close()
            driver.switch_to.window(home_page_handle)
            driver.switch_to.default_content()
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
                    selected_facility = select.first_selected_option
                    facility_identity = (
                        selected_facility.get_attribute("value")
                        or selected_facility.text
                        or f"option-{i}"
                    ).strip()
                    time.sleep(1)
                    btn = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.CSS_SELECTOR, "button.selectionButton")))
                    btn.click()
                    time.sleep(1)
                    try:
                        WebDriverWait(driver, 30).until(EC.invisibility_of_element_located((By.XPATH, "//loading-table-animation/div[@class='cssload-piano']")))

                        if driver.find_elements(By.XPATH, '//img[@class="downloadIcon"]'):
                            requested_at = time.time()
                            driver.find_elements(By.XPATH, '//img[@class="downloadIcon"]')[-1].click()
                            checkDownloads(11)
                            time.sleep(3)
                            recordObservedDownload(
                                "DSW_DAILY_SERVICE",
                                "DSW",
                                requested_at,
                            )
                    except:
                        pass

                    collect_dsw_package_status(
                        driver,
                        dsw_window_handle=daily_service_week_page_handle,
                        download_folder=DOWNLOAD_FOLDER,
                        facility_identity=facility_identity,
                        service_date=current_date.strftime("%Y-%m-%d"),
                    )
                except Exception as ee:
                    logging.info(ee)

        # Capture the latest sliding-session cookies after all requested
        # sections have completed so the next success-chained cycle can reuse
        # the session established by this cycle.
        driver.switch_to.window(home_page_handle)
        driver.switch_to.default_content()
        persistSessionCookies(driver)
    except Exception as e:
        logging.info(e)
        browser_retained = False
        if PERSIST_BROWSER and home_page_handle and ACTIVE_SECTION:
            try:
                driver.switch_to.window(home_page_handle)
                driver.switch_to.default_content()
                persistSessionCookies(driver)
                browser_retained = True
                logging.info("FedEx browser session retained after section failure")
            except Exception as retain_error:
                logging.info(
                    "FedEx browser session could not be retained: %s",
                    retain_error,
                )
        if not browser_retained:
            driver.quit()
        logging.info("Crashed On: " + str(ACTIVE_SECTION) + ' and ' + str(ACTIVE_SECTION_OPTION))
        writeError(formatted_date, f"Crashed On:{ACTIVE_SECTION} and {ACTIVE_SECTION_OPTION}", "Daily scrape", START_TIME)
        time.sleep(3)
        max_retries = int(os.environ.get("FCMS_MAX_RETRIES", "0"))
        if retry < max_retries:
            return main(ACTIVE_SECTION, ACTIVE_SECTION_OPTION, retry+1)
        else:
            logging.info(f'{retry} retries attempted; max_retries={max_retries}. exiting one-shot run.')
            sys.exit(1)

    if PERSIST_BROWSER:
        logging.info("FedEx browser session retained for the next cycle")
    else:
        driver.quit()
    time.sleep(5)
    success = renameFolder(DOWNLOAD_FOLDER)

    extractDataFromFolder(os.path.basename(DOWNLOAD_FOLDER))

if __name__ == "__main__":
    main()
