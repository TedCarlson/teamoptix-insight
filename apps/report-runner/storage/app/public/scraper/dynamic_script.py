#!/root/Script/myenv/bin/python

import atexit
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
from selenium.common.exceptions import (
    ElementClickInterceptedException,
    StaleElementReferenceException,
    TimeoutException,
)
from sys import platform
import shutil
import socket
import tempfile
import threading
from datetime import datetime, timezone

# from webdriver_manager.chrome import ChromeDriverManager

from runtime_events import emit_runtime_event
from manifest_identity import (
    quarantineRejectedManifest,
    renameDownloadedManifest,
)
from dsw_package_status import (
    collect_dsw_daily_service,
    collect_dsw_package_status,
    purge_expired_local_package_artifacts,
)
from dro_collection import collect_dro_package_detail

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
FRESH_BROWSER = os.environ.get(
    "FCMS_FRESH_BROWSER",
    "0",
).strip().lower() in {"1", "true", "yes", "on"}
FORCE_CREDENTIAL_AUTH = os.environ.get(
    "FCMS_FORCE_CREDENTIAL_AUTH",
    "0",
).strip().lower() in {"1", "true", "yes", "on"}
CHROME_DEBUGGER_ADDRESS = os.environ.get(
    "FCMS_CHROME_DEBUGGER_ADDRESS",
    "127.0.0.1:9222",
)
FRESH_CHROME_PROFILE_DIR = None

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


def writeRunnerMetadata(path, metadata):
    sidecar_path = path + ".runner.json"
    temporary_path = sidecar_path + f".{os.getpid()}.tmp"
    with open(temporary_path, "w", encoding="utf-8") as sidecar:
        json.dump(metadata, sidecar, sort_keys=True)
    os.replace(temporary_path, sidecar_path)


def finalizeManifestDownload(
    before,
    expected_type,
    requested_at,
    route_identity,
):
    downloaded_path, source_ready_at = waitForCompletedDownload(before)
    identification_started_at = time.time()
    try:
        renamed_path, manifest_identity = renameDownloadedManifest(
            downloaded_path,
            expected_type=expected_type,
            selected_route_identity=route_identity,
            selected_service_date=current_date.strftime("%Y-%m-%d"),
        )
    except Exception as identity_error:
        rejected_path = quarantineRejectedManifest(
            downloaded_path,
            identity_error,
        )
        raise RuntimeError(
            f"Manifest Header identification failed; preserved "
            f"{os.path.basename(rejected_path or downloaded_path)}: "
            f"{identity_error}"
        ) from identity_error
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
    filename = os.path.basename(renamed_path)
    writeRunnerMetadata(
        renamed_path,
        {
            **manifest_identity,
            "artifact_key": artifact_key,
            "report_family_key": "FCC",
            "declared_artifact_type": expected_type,
            "source_download_filename": manifest_identity.get(
                "source_download_filename"
            ),
            "collection_context": {
                "selected_work_area": route_identity,
                "selected_service_date": current_date.strftime(
                    "%Y-%m-%d"
                ),
                "source_lane": lane_key,
            },
            "payload_authority": "INGESTION_PIPELINE",
        },
    )
    logging.info(
        "Manifest identified and canonicalized "
        + json.dumps(
            {
                "declared_artifact_type": expected_type,
                "source_download_filename": manifest_identity.get(
                    "source_download_filename"
                ),
                "canonical_filename": filename,
                "selected_work_area": route_identity,
                "header_work_area": manifest_identity.get("work_area"),
            },
            sort_keys=True,
        )
    )

    event_common = {
        "artifact_key": artifact_key,
        "lane_key": lane_key,
        "route_identity": manifest_identity.get("work_area"),
        "filename": filename,
    }
    emit_runtime_event(
        "ARTIFACT_IDENTIFICATION_COMPLETED",
        "ARTIFACT_IDENTIFICATION",
        duration_ms=int((time.time() - identification_started_at) * 1000),
        metadata={
            "selected_work_area": route_identity,
            "header_work_area": manifest_identity.get("work_area"),
            "canonical_filename": filename,
            "header_authoritative": True,
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


def collectOptionalManifest(
    driver,
    *,
    button_xpath,
    expected_type,
    route_identity,
    wait_seconds=8,
):
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
        "route_identity": route_identity,
    }

    try:
        button = WebDriverWait(driver, wait_seconds).until(
            EC.element_to_be_clickable((By.XPATH, button_xpath))
        )
    except TimeoutException:
        page_state = driver.execute_script(
            """
            const workArea = document.getElementById(
              'manifestForm:workAreas'
            );
            return {
              ready_state: document.readyState,
              service_date: document.getElementById(
                'manifestForm:date_input'
              )?.value || null,
              selected_work_area: workArea?.selectedOptions?.[0]
                ?.textContent?.trim() || null,
              active_tabs: Array.from(
                document.getElementsByClassName('ui-state-active')
              ).map((element) => element.id).filter(Boolean).slice(0, 10),
              control_hints: Array.from(document.querySelectorAll(
                'input, button, a, img'
              ))
                .map((element) => ({
                  tag: (element.tagName || '').toLowerCase(),
                  id: element.id || '',
                  name: element.getAttribute('name') || '',
                  type: element.getAttribute('type') || '',
                  title: element.getAttribute('title') || '',
                  alt: element.getAttribute('alt') || ''
                }))
                .filter((control) => {
                  const signature = [
                    control.id,
                    control.name,
                    control.title,
                    control.alt
                  ].join(' ').toLowerCase();
                  return ['excel', 'export', 'download', 'generate']
                    .some((token) => signature.includes(token));
                })
                .slice(0, 25)
            };
            """
        )
        logging.info(
            "Manifest export unavailable "
            + json.dumps(
                {
                    "expected_type": expected_type,
                    "route_identity": route_identity,
                    "wait_seconds": wait_seconds,
                    "page_state": page_state,
                },
                sort_keys=True,
            )
        )
        emit_runtime_event(
            "SOURCE_UNAVAILABLE",
            "SOURCE",
            metadata={
                "reason": "EXPORT_CONTROL_NOT_AVAILABLE",
                "wait_seconds": wait_seconds,
                "page_state": page_state,
            },
            **event_common,
        )
        return None

    before_download = downloadSnapshot()
    requested_at = time.time()

    try:
        button.click()
        return finalizeManifestDownload(
            before_download,
            expected_type,
            requested_at,
            route_identity,
        )
    except Exception as error:
        logging.info(
            "Manifest download failed "
            + json.dumps(
                {
                    "expected_type": expected_type,
                    "route_identity": route_identity,
                    "error": str(error),
                },
                sort_keys=True,
            )
        )
        emit_runtime_event(
            "DOWNLOAD_FAILED",
            "DOWNLOAD",
            metadata={
                "reason": type(error).__name__,
                "message": str(error),
            },
            **event_common,
        )
        return None


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


def cleanupFreshChromeProfile():
    global FRESH_CHROME_PROFILE_DIR
    if not FRESH_CHROME_PROFILE_DIR:
        return
    profile_path = os.path.realpath(FRESH_CHROME_PROFILE_DIR)
    temporary_root = os.path.realpath(tempfile.gettempdir())
    if (
        os.path.dirname(profile_path) == temporary_root
        and os.path.basename(profile_path).startswith(
            "teamoptix-fedex-chrome-"
        )
    ):
        shutil.rmtree(profile_path, ignore_errors=True)
    FRESH_CHROME_PROFILE_DIR = None


def getDriver():
    global FRESH_CHROME_PROFILE_DIR
    if isPlatformLinux() and PERSIST_BROWSER and not FRESH_BROWSER:
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
        if FRESH_BROWSER:
            chrome_profile_dir = tempfile.mkdtemp(
                prefix="teamoptix-fedex-chrome-",
            )
            FRESH_CHROME_PROFILE_DIR = chrome_profile_dir
            atexit.register(cleanupFreshChromeProfile)
        else:
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

def releasePersistentDriver(driver):
    if not PERSIST_BROWSER:
        return
    try:
        service = getattr(driver, "service", None)
        if service is not None:
            service.stop()
        logging.info(
            "Detached WebDriver service; persistent Chrome remains available"
        )
    except Exception as error:
        logging.info(
            "Persistent WebDriver service detach failed: %s",
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

SECTION_LIST = ["P&D", "Service", "Pickup", "SCH", "Daily Service", "DRO"]
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

def normalize_manifest_work_area(value):
    text = str(value or "").strip().upper()
    match = re.search(r"(?<!\d)(\d{1,4})(?!\d)", text)
    if match:
        return str(int(match.group(1)))
    return re.sub(r"[^A-Z0-9]+", "", text)

def requested_manifest_work_areas():
    return {
        normalize_manifest_work_area(value)
        for value in os.environ.get(
            "FCMS_MANIFEST_WORK_AREAS",
            "",
        ).split(",")
        if normalize_manifest_work_area(value)
    }

REQUESTED_MANIFEST_WORK_AREAS = requested_manifest_work_areas()

def should_collect_manifest_work_area(value):
    return (
        not REQUESTED_MANIFEST_WORK_AREAS
        or normalize_manifest_work_area(value)
        in REQUESTED_MANIFEST_WORK_AREAS
    )


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
    if FORCE_CREDENTIAL_AUTH:
        return 0
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
    if FORCE_CREDENTIAL_AUTH:
        return
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

    if (
        not FORCE_CREDENTIAL_AUTH
        and driver.find_elements(By.XPATH, "//a[@id='PT_HOME']")
    ):
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


def findReusableFccWindow(driver):
    home_page_handle = None
    customer_connection_page_handle = None

    for handle in list(driver.window_handles):
        try:
            driver.switch_to.window(handle)
            driver.switch_to.default_content()

            if driver.find_elements(By.XPATH, "//li[@id='mainTabSettab_1']"):
                customer_connection_page_handle = handle
                continue

            if (
                driver.find_elements(By.XPATH, "//a[@id='PT_HOME']")
                or driver.find_elements(
                    By.XPATH,
                    "//iframe[@title='FCC Links']",
                )
            ):
                home_page_handle = handle
        except Exception as error:
            logging.info(
                "Existing FedEx window inspection skipped: %s",
                error,
            )

    if customer_connection_page_handle:
        driver.switch_to.window(customer_connection_page_handle)
        driver.switch_to.default_content()

    return home_page_handle, customer_connection_page_handle


def selectWorkArea(driver, option_index, max_attempts=3):
    last_error = None

    for attempt in range(1, max_attempts + 1):
        try:
            select_element = WebDriverWait(driver, 30).until(
                EC.presence_of_element_located(
                    (By.XPATH, "//select[@id='manifestForm:workAreas']")
                )
            )
            select = Select(select_element)
            option = select.options[option_index]
            selected_work_area = (
                option.text
                or option.get_attribute("value")
                or f"option-{option_index}"
            ).strip()
            select.select_by_index(option_index)
            return selected_work_area
        except StaleElementReferenceException as error:
            last_error = error
            logging.info(
                "Work area selector refreshed during option %s; "
                "reacquiring attempt %s/%s",
                option_index,
                attempt,
                max_attempts,
            )
            time.sleep(0.5)

    raise last_error


def clickManifestSearch(driver, option_index, max_attempts=3):
    last_error = None

    for attempt in range(1, max_attempts + 1):
        try:
            search_button = WebDriverWait(driver, 30).until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//input[@id='manifestForm:search']")
                )
            )
            search_button.click()
            overlay = (
                By.XPATH,
                "//div[@id='manifestForm:submitTransferNotification_bg']",
            )
            try:
                WebDriverWait(driver, 8, poll_frequency=0.1).until(
                    EC.visibility_of_element_located(overlay)
                )
            except TimeoutException:
                logging.info(
                    "Manifest refresh overlay was not observed for option %s; "
                    "waiting for the application request queue instead",
                    option_index,
                )

            WebDriverWait(driver, 45, poll_frequency=0.1).until(
                lambda current_driver: current_driver.execute_script(
                    """
                    const overlay = document.getElementById(
                      'manifestForm:submitTransferNotification_bg'
                    );
                    const overlayHidden = !overlay ||
                      window.getComputedStyle(overlay).display === 'none' ||
                      window.getComputedStyle(overlay).visibility === 'hidden' ||
                      Number(window.getComputedStyle(overlay).opacity || 1) === 0;
                    const ajaxIdle = !window.PrimeFaces ||
                      !PrimeFaces.ajax ||
                      !PrimeFaces.ajax.Queue ||
                      typeof PrimeFaces.ajax.Queue.isEmpty !== 'function' ||
                      PrimeFaces.ajax.Queue.isEmpty();
                    return document.readyState === 'complete' &&
                      overlayHidden && ajaxIdle;
                    """
                )
            )
            refreshed_select = Select(
                WebDriverWait(driver, 30).until(
                    EC.presence_of_element_located(
                        (By.XPATH, "//select[@id='manifestForm:workAreas']")
                    )
                )
            )
            if refreshed_select.options[option_index].get_attribute(
                "selected"
            ) is None:
                raise RuntimeError(
                    f"Manifest route selection changed during refresh for option {option_index}"
                )
            return
        except (
            ElementClickInterceptedException,
            StaleElementReferenceException,
        ) as error:
            last_error = error
            if isinstance(error, ElementClickInterceptedException):
                dismissStuckManifestOverlay(driver)
            logging.info(
                "Manifest search refreshed during option %s; "
                "reacquiring attempt %s/%s",
                option_index,
                attempt,
                max_attempts,
            )
            time.sleep(0.5)

    raise last_error


def dismissStuckManifestOverlay(driver):
    dismissed = False
    overlays = driver.find_elements(
        By.XPATH,
        "//div[@id='manifestForm:submitTransferNotification_bg']",
    )
    for overlay in overlays:
        try:
            if not overlay.is_displayed():
                continue
            driver.execute_script(
                """
                arguments[0].style.setProperty(
                  'display',
                  'none',
                  'important'
                );
                arguments[0].setAttribute('aria-hidden', 'true');
                """,
                overlay,
            )
            dismissed = True
        except StaleElementReferenceException:
            continue

    if dismissed:
        logging.info("Cleared stale FedEx manifest loading overlay")
    return dismissed


def clickManifestTab(driver, tab_label, option_index, max_attempts=3):
    last_error = None

    for attempt in range(1, max_attempts + 1):
        try:
            WebDriverWait(driver, 30).until(
                EC.invisibility_of_element_located(
                    (
                        By.XPATH,
                        "//div[@id='manifestForm:submitTransferNotification_bg']",
                    )
                )
            )
            tab = WebDriverWait(driver, 30).until(
                EC.element_to_be_clickable(
                    (By.XPATH, f"//em[contains(text(), '{tab_label}')]")
                )
            )
            try:
                tab.click()
            except ElementClickInterceptedException:
                tab.find_element(By.XPATH, '..').click()

            tab_id = tab.find_element(By.XPATH, '../..').get_attribute('id')
            WebDriverWait(driver, 30).until(
                element_opacity_exists(tab_id)
            )
            return
        except (
            ElementClickInterceptedException,
            StaleElementReferenceException,
            TimeoutException,
        ) as error:
            last_error = error
            if isinstance(
                error,
                (ElementClickInterceptedException, TimeoutException),
            ):
                dismissStuckManifestOverlay(driver)
            logging.info(
                "Manifest tab %s refreshed during option %s; "
                "reacquiring attempt %s/%s",
                tab_label,
                option_index,
                attempt,
                max_attempts,
            )
            time.sleep(0.5)

    raise last_error


def main(section_='', option_=0, retry=1):
    global SECTION_LIST, ACTIVE_SECTION, ACTIVE_SECTION_OPTION
    purge_expired_local_package_artifacts(MAIN_FOLDER)
    driver = getDriver()
    home_page_handle = None
    customer_connection_page_handle = None
    logging.info("Driver loaded...")
    try:
        (
            home_page_handle,
            customer_connection_page_handle,
        ) = findReusableFccWindow(driver)

        if customer_connection_page_handle:
            logging.info(
                "FedEx Customer Connection application session reused"
            )
            persistSessionCookies(driver)
            emit_runtime_event(
                "SESSION_REUSED",
                "AUTHENTICATION",
                metadata={"persistent_fcc_window": True},
            )
        else:
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

        # A long-lived FCC application can retain stale page state while the
        # authenticated FedEx home session remains valid. Reopen only the FCC
        # application before P&D so its manifest export controls are rebuilt.
        if (
            should_run_section('P&D')
            and customer_connection_page_handle
            and home_page_handle
        ):
            logging.info(
                "Reopening FedEx Customer Connection application for "
                "manifest collection"
            )
            driver.switch_to.window(customer_connection_page_handle)
            driver.close()
            customer_connection_page_handle = None
            driver.switch_to.window(home_page_handle)
            driver.switch_to.default_content()
            emit_runtime_event(
                "APPLICATION_REOPENED",
                "SOURCE_DISCOVERY",
                lane_key="FCC_P_AND_D",
                metadata={
                    "session_reused": True,
                    "reason": "FRESH_MANIFEST_APPLICATION",
                },
            )

        if secion_index <= 3 and needs_fcc_window:
            if customer_connection_page_handle:
                driver.switch_to.window(customer_connection_page_handle)
                driver.switch_to.default_content()
                dismissStuckManifestOverlay(driver)
                WebDriverWait(driver, 30).until(
                    EC.presence_of_element_located(
                        (By.XPATH, "//li[@id='mainTabSettab_1']")
                    )
                )
            else:
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
            WebDriverWait(driver, 30).until(
                EC.invisibility_of_element_located(
                    (
                        By.XPATH,
                        "//div[@id='manifestForm:submitTransferNotification_bg']",
                    )
                )
            )
            p_d = WebDriverWait(driver, 30).until(EC.element_to_be_clickable((By.XPATH, "//li[@id='mainTabSettab_1']")))
            time.sleep(2)
            if "activeTab" not in str(p_d.get_attribute("class") or ""):
                p_d.click()

            select_element = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//select[@id='manifestForm:workAreas']")))

            total_select_options = len(select_element.find_elements(By.XPATH, 'option'))
            collected_work_areas = set()
            manifest_failures = []
            for i in range(option_, total_select_options):
                if i == 0: continue
                select_element = WebDriverWait(driver, 30).until(
                    EC.presence_of_element_located(
                        (By.XPATH, "//select[@id='manifestForm:workAreas']")
                    )
                )
                option = Select(select_element).options[i]
                work_area_hint = (
                    option.text
                    or option.get_attribute("value")
                    or f"option-{i}"
                ).strip()
                if not should_collect_manifest_work_area(work_area_hint):
                    continue
                logging.info(f'Selecting option {i}')
                ACTIVE_SECTION_OPTION = i
                time.sleep(1)
                selected_work_area = selectWorkArea(driver, i)
                collected_work_areas.add(
                    normalize_manifest_work_area(selected_work_area)
                )
                time.sleep(1)

                logging.info("Waiting for the search button to be visible...")
                clickManifestSearch(driver, i)
                time.sleep(1)

                logging.info("Waiting for the load screen...")
                WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//div[@class='mobi-submitnotific-container-hide']")))
                WebDriverWait(driver, 30).until(
                    EC.invisibility_of_element_located(
                        (
                            By.XPATH,
                            "//div[@id='manifestForm:submitTransferNotification_bg']",
                        )
                    )
                )
                time.sleep(1)

                # The original FCC runner always activated Combined Manifest
                # first. That request initializes the route's manifest panels
                # before Delivery and Pickup are opened. Keep that navigation
                # contract even when the Combined file itself is not requested.
                time.sleep(1)
                clickManifestTab(
                    driver,
                    "Combined Manifest",
                    i,
                )
                logging.info("Initialized the Combined Manifest tab...")
                time.sleep(1)

                # Combined Manifest download remains optional.
                if (
                    should_download_manifest("combined")
                ):
                    logging.info("Waiting for loading...")
                    combined_path = collectOptionalManifest(
                        driver,
                        button_xpath="//input[@id='manifestForm:buttonCombinedGenerateExcel']",
                        expected_type="combined",
                        route_identity=selected_work_area,
                    )
                else:
                    logging.info(
                        "Skipping Combined Manifest download after initialization"
                    )

                # Delivery Manifest
                if (
                    should_download_manifest("delivery")
                ):
                    time.sleep(1)
                    clickManifestTab(
                        driver,
                        "Delivery Manifest",
                        i,
                    )
                    logging.info("Clicked the tab Delivery Manifest...")
                    time.sleep(1)
                    logging.info("Waiting for loading...")

                    delivery_path = collectOptionalManifest(
                        driver,
                        button_xpath="//input[@id='manifestForm:buttonDeliveryGenerateExcel']",
                        expected_type="delivery",
                        route_identity=selected_work_area,
                    )
                    if not delivery_path:
                        manifest_failures.append(selected_work_area)
                else:
                    logging.info("Skipping Delivery Manifest")

                # Pickup manifest
                if (
                    should_download_manifest("pickup")
                ):
                    time.sleep(1)
                    clickManifestTab(
                        driver,
                        "Pickup Manifest",
                        i,
                    )
                    logging.info("Clicked the tab Pickup manifest...")
                    time.sleep(1)
                    logging.info("Waiting for loading...")

                    pickup_path = collectOptionalManifest(
                        driver,
                        button_xpath="//input[@id='manifestForm:buttonGenerateExcel']",
                        expected_type="pickup",
                        route_identity=selected_work_area,
                    )
                else:
                    logging.info("Skipping Pickup Manifest")
            if (
                REQUESTED_MANIFEST_WORK_AREAS
                and not REQUESTED_MANIFEST_WORK_AREAS.issubset(
                    collected_work_areas
                )
            ):
                missing = sorted(
                    REQUESTED_MANIFEST_WORK_AREAS - collected_work_areas
                )
                raise RuntimeError(
                    "Requested manifest work areas were not available: "
                    + ", ".join(missing)
                )
            if manifest_failures:
                raise RuntimeError(
                    "Delivery manifest collection incomplete for work areas: "
                    + ", ".join(manifest_failures)
                )
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
                # The FCC window carries application-level authorization that
                # is not recreated by the home-page cookie alone. Preserve it
                # while DSW opens in its own tab so the next success-chained
                # pulse can continue exporting manifests without logging in
                # again or reopening FCC in a degraded state.
                if handle in {
                    home_page_handle,
                    customer_connection_page_handle,
                }:
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
                    btn = WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.CSS_SELECTOR, "button.selectionButton")))
                    btn.click()
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

        if secion_index <= 5 and should_run_section('DRO'):
            ACTIVE_SECTION = 'DRO'
            logging.info("Accessing DRO Package Detail")
            collect_dro_package_detail(
                driver,
                download_folder=DOWNLOAD_FOLDER,
            )
            ACTIVE_SECTION_OPTION = 0

        # Capture the latest sliding-session cookies after all requested
        # sections have completed so the next success-chained cycle can reuse
        # the session established by this cycle.
        driver.switch_to.window(home_page_handle or customer_connection_page_handle)
        driver.switch_to.default_content()
        persistSessionCookies(driver)
    except Exception as e:
        logging.exception(
            "Unhandled %s in section %s option %s: %s",
            type(e).__name__,
            ACTIVE_SECTION or "UNKNOWN",
            ACTIVE_SECTION_OPTION,
            e,
        )
        emit_runtime_event(
            "COLLECTION_FAILED",
            "SOURCE",
            lane_key=ACTIVE_SECTION or None,
            metadata={
                "exception_type": type(e).__name__,
                "message": str(e)[:500] or "No exception message was provided.",
                "option": ACTIVE_SECTION_OPTION,
            },
        )
        browser_retained = False
        if PERSIST_BROWSER and home_page_handle and ACTIVE_SECTION:
            try:
                driver.switch_to.window(home_page_handle)
                driver.switch_to.default_content()
                persistSessionCookies(driver)
                releasePersistentDriver(driver)
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
        releasePersistentDriver(driver)
        logging.info("FedEx browser session retained for the next cycle")
    else:
        driver.quit()
    time.sleep(5)
    logging.info(
        "Collection complete; opaque artifacts are ready for database "
        "handoff and ingestion-owned validation."
    )

if __name__ == "__main__":
    main()
