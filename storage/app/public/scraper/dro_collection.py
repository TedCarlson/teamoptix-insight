"""Browser navigation for the FedEx DRO Package Detail export."""

from __future__ import annotations

import os
import time
from pathlib import Path

from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from runtime_events import emit_runtime_event


DRO_LOGIN_URL = "https://dro.routesmart.com/login"
DRO_SERVICE_AREA = os.environ.get("FCMS_DRO_SERVICE_AREA", "").strip()
DRO_BUSINESS_NAME = os.environ.get("FCMS_DRO_BUSINESS_NAME", "").strip()


def _normalized_xpath_literal(value: str) -> str:
    """Return a safe XPath string literal."""

    if "'" not in value:
        return f"'{value}'"
    if '"' not in value:
        return f'"{value}"'
    pieces = value.split("'")
    return "concat(" + ', "\'", '.join(f"'{piece}'" for piece in pieces) + ")"


def _page_has(driver, xpath: str) -> bool:
    return bool(driver.find_elements(By.XPATH, xpath))


def _wait_for_dro_entry(driver, timeout_seconds: int = 90) -> str:
    """Wait until DRO exposes login, entity selection, or its dashboard."""

    def state(current_driver):
        if _page_has(
            current_driver,
            "//*[@id='login-service-providers-button']"
            " | //button[normalize-space()='SERVICE PROVIDERS']",
        ):
            return "LOGIN"
        if _page_has(
            current_driver,
            "//*[normalize-space()='Select Service Area']",
        ):
            return "SELECTION"
        if _page_has(
            current_driver,
            "//*[normalize-space()='REPORT']"
            " | //*[normalize-space()='Report']",
        ):
            return "DASHBOARD"
        return False

    return WebDriverWait(driver, timeout_seconds).until(state)


def _select_service_provider(driver) -> None:
    button = WebDriverWait(driver, 30).until(
        EC.element_to_be_clickable(
            (
                By.XPATH,
                "//*[@id='login-service-providers-button']"
                " | //button[normalize-space()='SERVICE PROVIDERS']",
            )
        )
    )
    button.click()


def _select_entity(driver) -> None:
    if not DRO_SERVICE_AREA or not DRO_BUSINESS_NAME:
        raise RuntimeError(
            "DRO entity navigation requires FCMS_DRO_SERVICE_AREA and "
            "FCMS_DRO_BUSINESS_NAME."
        )

    service_area = _normalized_xpath_literal(DRO_SERVICE_AREA)
    business_name = _normalized_xpath_literal(DRO_BUSINESS_NAME)
    row_xpath = (
        "//tr["
        f".//*[normalize-space()={service_area}]"
        " and "
        f".//*[normalize-space()={business_name}]"
        "]"
    )
    row = WebDriverWait(driver, 30).until(
        EC.element_to_be_clickable((By.XPATH, row_xpath))
    )
    row.click()


def _open_package_detail_report(driver) -> None:
    report = WebDriverWait(driver, 45).until(
        EC.element_to_be_clickable(
            (
                By.XPATH,
                "//*[self::a or self::button or @role='button']"
                "[translate(normalize-space(.), "
                "'abcdefghijklmnopqrstuvwxyz', "
                "'ABCDEFGHIJKLMNOPQRSTUVWXYZ')='REPORT']",
            )
        )
    )
    report.click()

    package_detail = WebDriverWait(driver, 45).until(
        EC.element_to_be_clickable(
            (
                By.XPATH,
                "//*[self::a or self::button or @role='tab' or @role='button']"
                "[contains(translate(normalize-space(.), "
                "'abcdefghijklmnopqrstuvwxyz', "
                "'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'PACKAGE DETAIL')]",
            )
        )
    )
    package_detail.click()


def _click_csv_export(driver) -> None:
    export_xpath = (
        "//*[self::button or self::a or @role='button']"
        "["
        "contains(translate(@title, 'abcdefghijklmnopqrstuvwxyz', "
        "'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'EXPORT TO CSV')"
        " or contains(translate(@aria-label, 'abcdefghijklmnopqrstuvwxyz', "
        "'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'EXPORT TO CSV')"
        " or contains(translate(normalize-space(.), "
        "'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), "
        "'EXPORT TO CSV')"
        "]"
        " | //img["
        "contains(translate(@title, 'abcdefghijklmnopqrstuvwxyz', "
        "'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'EXPORT TO CSV')"
        " or contains(translate(@alt, 'abcdefghijklmnopqrstuvwxyz', "
        "'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'EXPORT TO CSV')"
        "]"
    )
    export = WebDriverWait(driver, 45).until(
        EC.element_to_be_clickable((By.XPATH, export_xpath))
    )
    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center'});",
        export,
    )
    export.click()


def _download_snapshot(download_folder: str) -> set[str]:
    return {
        str(path.resolve())
        for path in Path(download_folder).iterdir()
        if path.is_file()
        and not path.name.startswith(".")
        and path.suffix.lower() == ".csv"
    }


def _wait_for_csv(
    download_folder: str,
    before: set[str],
    timeout_seconds: int = 60,
) -> str:
    deadline = time.time() + timeout_seconds
    last_sizes: dict[str, int] = {}

    while time.time() < deadline:
        folder = Path(download_folder)
        active = list(folder.glob("*.crdownload"))
        candidates = [
            path
            for path in folder.iterdir()
            if path.is_file()
            and not path.name.startswith(".")
            and path.suffix.lower() == ".csv"
            and str(path.resolve()) not in before
        ]
        candidates.sort(key=lambda path: path.stat().st_mtime, reverse=True)

        for candidate in candidates:
            size = candidate.stat().st_size
            key = str(candidate.resolve())
            if size > 0 and last_sizes.get(key) == size and not active:
                return str(candidate)
            last_sizes[key] = size

        time.sleep(0.5)

    raise TimeoutException("Timed out waiting for DRO Package Detail CSV.")


def collect_dro_package_detail(driver, download_folder: str) -> str:
    """Navigate DRO and return the untouched Package Detail CSV path."""

    emit_runtime_event(
        "SOURCE_REQUESTED",
        "SOURCE",
        artifact_key="DRO_PACKAGE_DETAIL",
        lane_key="DRO_PACKAGE_DETAIL",
    )
    driver.switch_to.new_window("tab")
    driver.get(DRO_LOGIN_URL)

    state = _wait_for_dro_entry(driver)
    if state == "LOGIN":
        _select_service_provider(driver)
        state = _wait_for_dro_entry(driver)
    if state == "SELECTION":
        _select_entity(driver)
        state = _wait_for_dro_entry(driver)
    if state != "DASHBOARD":
        raise RuntimeError(f"DRO navigation stopped in unexpected state {state}.")

    _open_package_detail_report(driver)
    before = _download_snapshot(download_folder)
    requested_at = time.time()
    _click_csv_export(driver)
    downloaded_path = _wait_for_csv(download_folder, before)

    event_common = {
        "artifact_key": "DRO_PACKAGE_DETAIL",
        "lane_key": "DRO_PACKAGE_DETAIL",
        "filename": os.path.basename(downloaded_path),
    }
    emit_runtime_event(
        "SOURCE_READY",
        "SOURCE",
        occurred_at=time.strftime(
            "%Y-%m-%dT%H:%M:%SZ",
            time.gmtime(requested_at),
        ),
        **event_common,
    )
    emit_runtime_event("DOWNLOAD_COMPLETED", "DOWNLOAD", **event_common)
    return downloaded_path
