"""Failure classification rules shared by continuous runner cycles."""

import re


AUTH_FAILURE_PATTERN = re.compile(
    r"login failed|login failure|authentication failed|invalid credentials|"
    r"incorrect credentials|invalid username|invalid password|"
    r"credentials rejected",
    re.IGNORECASE,
)


def is_authentication_failure(
    output_tail: str,
    event_types: set[str],
) -> bool:
    """Return true only when the collector recorded credential rejection.

    A browser crash between AUTH_ATTEMPTED and AUTH_COMPLETED is not evidence
    that FedEx rejected the credential. Treating that missing completion marker
    as authentication failure permanently blocks an otherwise valid credential
    version in the continuous controller.
    """
    return "AUTH_REJECTED" in event_types or bool(
        AUTH_FAILURE_PATTERN.search(output_tail)
    )
