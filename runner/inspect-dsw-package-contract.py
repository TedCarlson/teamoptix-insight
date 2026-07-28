#!/usr/bin/env python3
"""Read a PII-safe DSW package-link contract through Chrome DevTools."""

from __future__ import annotations

import json
import os
import urllib.request

import websocket


DEBUGGER_HTTP = os.environ.get(
    "FCMS_CHROME_DEBUGGER_HTTP",
    "http://127.0.0.1:9222",
).rstrip("/")

EXPRESSION = r"""
(() => {
  const normalize = (value) =>
    String(value || "").replace(/\s+/g, " ").trim();
  const result = {
    title: document.title,
    date_value:
      document.querySelector("input.formField-header")?.value || null,
    facility_value:
      document.querySelector("#facilitySelect")?.value || null,
    facility_text: normalize(
      document.querySelector("#facilitySelect option:checked")?.textContent
    ) || null,
    table_count: document.querySelectorAll("table").length,
    download_icons: Array.from(
      document.querySelectorAll("img.downloadIcon")
    ).map((image) => ({
      alt: image.alt || null,
      title: image.title || null,
      source_name: (image.src || "").split("/").pop()?.split("?")[0] || null,
    })),
    package_contract: null,
  };

  for (const table of Array.from(document.querySelectorAll("table"))) {
    const rows = Array.from(table.querySelectorAll("tr"));
    const grid = [];
    const origins = new Map();
    rows.forEach((row, rowIndex) => {
      grid[rowIndex] = grid[rowIndex] || [];
      let columnIndex = 0;
      const cells = Array.from(row.children).filter((cell) =>
        ["TD", "TH"].includes(cell.tagName)
      );
      cells.forEach((cell) => {
        while (grid[rowIndex][columnIndex]) columnIndex += 1;
        const rowSpan = Math.max(1, Number(cell.rowSpan || 1));
        const columnSpan = Math.max(1, Number(cell.colSpan || 1));
        origins.set(cell, { rowIndex, columnIndex });
        for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
          grid[rowIndex + rowOffset] =
            grid[rowIndex + rowOffset] || [];
          for (
            let columnOffset = 0;
            columnOffset < columnSpan;
            columnOffset += 1
          ) {
            grid[rowIndex + rowOffset][columnIndex + columnOffset] = cell;
          }
        }
        columnIndex += columnSpan;
      });
    });

    for (const [header, origin] of origins.entries()) {
      if (normalize(header.innerText) !== "All Status Code Pkgs") continue;
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const contractMatch = normalize(rows[rowIndex].innerText).match(
          /Contract\s+(C\d+)\s+Total/i
        );
        if (!contractMatch) continue;
        const cell = grid[rowIndex]?.[origin.columnIndex];
        const countText = normalize(cell?.innerText);
        const link = cell?.querySelector("a");
        const describe = (element) => {
          if (!element) return null;
          const allowedAttributes = Array.from(element.attributes || [])
            .filter((attribute) =>
              ["class", "role", "onclick", "style", "tabindex", "target"]
                .includes(attribute.name.toLowerCase()) ||
              attribute.name.toLowerCase().startsWith("data-")
            )
            .reduce((attributes, attribute) => {
              attributes[attribute.name] = attribute.value;
              return attributes;
            }, {});
          return {
            tag_name: element.tagName,
            text: normalize(element.innerText || element.textContent) || null,
            attributes: allowedAttributes,
            has_href: Boolean(element.getAttribute?.("href")),
            href_path:
              (() => {
                const href = element.getAttribute?.("href");
                if (!href) return null;
                try {
                  return new URL(href, document.location.href).pathname;
                } catch {
                  return "UNPARSEABLE";
                }
              })(),
            onclick_property: typeof element.onclick === "function",
            cursor: window.getComputedStyle(element).cursor,
            pointer_events: window.getComputedStyle(element).pointerEvents,
          };
        };
        result.package_contract = {
          header_exact_match: true,
          physical_column_index: origin.columnIndex,
          contract_number: contractMatch[1].toUpperCase(),
          count_text: countText || null,
          count_numeric:
            Number(countText.replace(/,/g, "")) || (countText === "0" ? 0 : null),
          link_present: Boolean(link),
          link_target: link?.getAttribute("target") || null,
          link_has_href: Boolean(link?.getAttribute("href")),
          link_has_onclick: Boolean(link?.getAttribute("onclick")),
          cell: describe(cell),
          descendants: Array.from(cell?.querySelectorAll("*") || [])
            .slice(0, 12)
            .map(describe),
        };
      }
    }
  }
  return result;
})()
"""


def main() -> None:
    with urllib.request.urlopen(
        f"{DEBUGGER_HTTP}/json/list",
        timeout=5,
    ) as response:
        targets = json.load(response)

    target = next(
        (
            item
            for item in targets
            if item.get("type") == "page"
            and item.get("title") == "AutoDSW"
        ),
        None,
    )
    if not target:
        print(json.dumps({"status": "DSW_TAB_NOT_OPEN"}))
        return

    connection = websocket.create_connection(
        target["webSocketDebuggerUrl"],
        timeout=10,
        suppress_origin=True,
    )
    try:
        command_id = 1
        connection.send(
            json.dumps(
                {
                    "id": command_id,
                    "method": "Runtime.evaluate",
                    "params": {
                        "expression": EXPRESSION,
                        "returnByValue": True,
                        "awaitPromise": True,
                    },
                }
            )
        )
        while True:
            message = json.loads(connection.recv())
            if message.get("id") != command_id:
                continue
            if message.get("error"):
                raise RuntimeError(message["error"].get("message"))
            value = (
                message.get("result", {})
                .get("result", {})
                .get("value")
            )
            print(json.dumps(value, indent=2, sort_keys=True))
            return
    finally:
        connection.close()


if __name__ == "__main__":
    main()
