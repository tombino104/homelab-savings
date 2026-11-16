# Changelog

All notable changes to this project are listed here, newest first.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

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
