#!/usr/bin/env python3
"""Regression checks for credential lockout classification."""

import unittest

from failure_classification import is_authentication_failure


class AuthenticationFailureClassificationTests(unittest.TestCase):
    def test_browser_crash_after_auth_attempt_is_collection_failure(self):
        self.assertFalse(
            is_authentication_failure(
                "selenium.common.exceptions.WebDriverException: tab crashed",
                {"AUTH_ATTEMPTED", "EXCEPTION"},
            )
        )

    def test_disconnected_browser_is_not_credential_rejection(self):
        self.assertFalse(
            is_authentication_failure(
                "InvalidSessionIdException: browser has closed the connection",
                {"AUTH_ATTEMPTED"},
            )
        )

    def test_explicit_rejection_event_locks_the_credential(self):
        self.assertTrue(
            is_authentication_failure("", {"AUTH_REJECTED"})
        )

    def test_explicit_invalid_credentials_text_locks_the_credential(self):
        self.assertTrue(
            is_authentication_failure(
                "PurpleID reported invalid credentials.",
                {"AUTH_ATTEMPTED"},
            )
        )


if __name__ == "__main__":
    unittest.main()
