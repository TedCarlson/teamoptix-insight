import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, call, patch

import dro_collection


class StateDriver:
    def __init__(self, states):
        self.states = iter(states)
        self.state = None

    def find_elements(self, _by, xpath):
        if "login-service-providers-button" in xpath:
            self.state = next(self.states, self.state)
            return [object()] if self.state == "LOGIN" else []
        if "Select Service Area" in xpath:
            return [object()] if self.state == "SELECTION" else []
        if "normalize-space()='REPORT'" in xpath:
            return [object()] if self.state == "DASHBOARD" else []
        return []


class DroCollectionTests(unittest.TestCase):
    def test_xpath_literal_handles_apostrophe(self):
        self.assertEqual(
            dro_collection._normalized_xpath_literal("BEACON'S"),
            '"BEACON\'S"',
        )

    def test_download_snapshot_tracks_only_csv(self):
        with tempfile.TemporaryDirectory() as folder:
            csv_path = Path(folder) / "package_detail.csv"
            csv_path.write_text("a,b\n1,2\n", encoding="utf-8")
            (Path(folder) / "report.xls").write_bytes(b"xls")

            self.assertEqual(
                dro_collection._download_snapshot(folder),
                {str(csv_path.resolve())},
            )

    @patch.object(dro_collection, "WebDriverWait")
    @patch.object(dro_collection.EC, "element_to_be_clickable")
    def test_csv_export_targets_blob_download_anchor(
        self,
        element_to_be_clickable,
        webdriver_wait,
    ):
        driver = Mock()
        export = Mock()
        condition = object()
        element_to_be_clickable.return_value = condition
        webdriver_wait.return_value.until.return_value = export

        dro_collection._click_csv_export(driver)

        element_to_be_clickable.assert_called_once_with(
            (
                dro_collection.By.CSS_SELECTOR,
                dro_collection.DRO_CSV_EXPORT_SELECTOR,
            )
        )
        webdriver_wait.assert_called_once_with(driver, 45)
        webdriver_wait.return_value.until.assert_called_once_with(condition)
        driver.execute_script.assert_has_calls(
            [
                call(
                    "arguments[0].scrollIntoView({block: 'center'});",
                    export,
                ),
                call("arguments[0].click();", export),
            ]
        )

    def test_post_login_wait_ignores_still_visible_login_state(self):
        driver = StateDriver(["LOGIN", "SELECTION"])
        self.assertEqual(
            dro_collection._wait_for_dro_entry(
                driver,
                timeout_seconds=1,
                accepted_states={"SELECTION", "DASHBOARD"},
            ),
            "SELECTION",
        )

    @patch.object(dro_collection, "DRO_SERVICE_AREA", "")
    @patch.object(dro_collection, "DRO_BUSINESS_NAME", "")
    def test_entity_selection_requires_navigation_configuration(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "FCMS_DRO_SERVICE_AREA",
        ):
            dro_collection._select_entity(object())

    @patch.object(dro_collection, "DRO_SERVICE_AREA", "309747")
    @patch.object(dro_collection, "DRO_BUSINESS_NAME", "")
    @patch.object(dro_collection, "WebDriverWait")
    @patch.object(dro_collection.EC, "presence_of_all_elements_located")
    @patch.object(dro_collection.EC, "element_to_be_clickable")
    def test_service_area_alone_can_select_the_company_entity(
        self,
        element_to_be_clickable,
        presence_of_all_elements_located,
        webdriver_wait,
    ):
        driver = Mock()
        row = Mock()
        presence_condition = object()
        clickable_condition = object()
        presence_of_all_elements_located.return_value = presence_condition
        element_to_be_clickable.return_value = clickable_condition
        webdriver_wait.return_value.until.side_effect = [[row], row]

        dro_collection._select_entity(driver)

        presence_of_all_elements_located.assert_called_once_with(
            (
                dro_collection.By.XPATH,
                "//tr[.//*[normalize-space()='309747']]",
            )
        )
        element_to_be_clickable.assert_called_once_with(row)
        self.assertEqual(
            webdriver_wait.return_value.until.call_args_list,
            [call(presence_condition), call(clickable_condition)],
        )
        row.click.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
