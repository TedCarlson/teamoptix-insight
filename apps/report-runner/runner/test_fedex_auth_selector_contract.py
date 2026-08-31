import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRAPER = ROOT / "storage" / "app" / "public" / "scraper"


class FedExAuthSelectorContractTests(unittest.TestCase):
    def test_every_collection_path_accepts_current_purpleid_username_field(self):
        for filename in (
            "dynamic_script.py",
            "scrape_particular_date.py",
            "service_area.py",
        ):
            source = (SCRAPER / filename).read_text(encoding="utf-8")
            with self.subTest(filename=filename):
                self.assertIn('credentials.username', source)
                self.assertIn('input[@id="username"]', source)


if __name__ == "__main__":
    unittest.main()
