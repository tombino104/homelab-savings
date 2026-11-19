# Changelog

All notable changes to this project are listed here, newest first.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-11-19

### Added
- Hardware is a list of purchases, each with its cost and month: the server, a disk added later, a UPS... Each one is paid in full in its month for the total saved so far, so a later purchase shows as a dip in the chart and can move the break-even.
- Prices over time: a service, a cost or the price per kWh can change from a given month. The total saved so far uses the price of each month, and the price in the row is always today's.
- What saved the most: in the summary, each service ranked by how much it has saved so far.

### Changed
- A single hardware cost saved by an earlier version becomes one purchase in the start month.
- The monthly hardware figure spreads each purchase over the months after it was made, so a purchase stops counting there once it is paid off.

## [0.4.0] - 2026-11-18

### Added
- Each service and each other cost has its own start month and an optional end month. A new one starts in the month you add it.
- Services and costs you no longer use are grouped at the bottom of their list, and a search field appears when the list gets long.

### Changed
- The total saved so far, the break-even date, the chart and the projections count each service and cost only for the months it was in use. Before, a service added later was counted as if it had always been there.
- The page is split into tabs (Summary, Services, Costs, Settings), with the net per month and the total saved always visible at the top.
- Rows are more compact: the description and the dates are in a details panel. Removing an item with a history asks first, since it also leaves the total saved.

## [0.3.0] - 2026-11-16

### Added
- The total saved so far: the monthly savings since the month you started, minus the whole hardware cost. It starts below zero and crosses zero at the break-even.
- An "Over time" chart of that total, with today and the break-even marked, and what you will have saved after 1, 3 and 5 years.
- Backup: download your numbers as a JSON file and restore them from one.

### Changed
- "Bought in" is now "Running since": the same month is used for the break-even date and for the total saved so far.

## [0.2.0] - 2026-11-15

### Added
- A short optional description for each service and each other cost, kept with the numbers.

## [0.1.0] - 2026-11-15

### Added
- First release: a calculator for how much money a homelab saves. Enter the cloud services you replaced, the electricity, the hardware and any other cost, and get the net savings per month and per year, plus the break-even date of the hardware.
- A small catalog of common self-hosted services with rough example prices, all editable.
- Prices per month or per year, sixteen currencies (no conversion), light, dark and system themes, English and Italian.
- A single static binary that serves the page and keeps the numbers in one JSON file. Multi-arch image (amd64 and arm64) on `ghcr.io/tombino104/homelab-savings`.
