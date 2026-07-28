#!/usr/bin/env python3
"""Print a sanitized structural inventory of the persistent FedEx browser."""

from __future__ import annotations

import json
from urllib.parse import urlsplit

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options


def safe_url(value: str) -> str:
    parsed = urlsplit(value)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"


def attributes(element, names: tuple[str, ...]) -> dict[str, str]:
    result: dict[str, str] = {}
    for name in names:
        value = element.get_attribute(name)
        if value:
            result[name] = value[:240]
    return result


def main() -> None:
    options = Options()
    options.add_experimental_option(
        "debuggerAddress",
        "127.0.0.1:9222",
    )
    driver = webdriver.Chrome(options=options)
    inventory: list[dict[str, object]] = []

    for handle in driver.window_handles:
        driver.switch_to.window(handle)
        frame_inventory: list[dict[str, object]] = []
        frames = driver.find_elements(By.TAG_NAME, "iframe")
        for index, frame in enumerate(frames):
            frame_inventory.append(
                {
                    "index": index,
                    **attributes(
                        frame,
                        ("id", "name", "title", "class", "src"),
                    ),
                }
            )

        inputs = [
            attributes(
                element,
                (
                    "id",
                    "name",
                    "type",
                    "class",
                    "placeholder",
                    "aria-label",
                ),
            )
            for element in driver.find_elements(By.CSS_SELECTOR, "input")
        ]
        buttons = [
            {
                **attributes(
                    element,
                    (
                        "id",
                        "name",
                        "type",
                        "class",
                        "aria-label",
                        "title",
                    ),
                ),
                "text": " ".join(element.text.split())[:160],
            }
            for element in driver.find_elements(
                By.CSS_SELECTOR,
                "button,input[type='submit'],input[type='button']",
            )
        ]
        links = [
            {
                **attributes(
                    element,
                    ("id", "name", "class", "title", "target"),
                ),
                "text": " ".join(element.text.split())[:160],
                "href": safe_url(element.get_attribute("href") or ""),
            }
            for element in driver.find_elements(By.TAG_NAME, "a")
        ]
        inventory.append(
            {
                "handle": handle,
                "title": driver.title,
                "url": safe_url(driver.current_url),
                "frames": frame_inventory[:40],
                "inputs": inputs[:80],
                "buttons": buttons[:80],
                "links": links[:120],
            }
        )

    print(json.dumps(inventory, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
