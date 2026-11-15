# Changelog

All notable changes to this project are listed here, newest first.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-15

### Added
- First release: a calculator for how much money a homelab saves. Enter the cloud services you replaced, the electricity, the hardware and any other cost, and get the net savings per month and per year, plus the break-even date of the hardware.
- A small catalog of common self-hosted services with rough example prices, all editable.
- Prices per month or per year, sixteen currencies (no conversion), light, dark and system themes, English and Italian.
- A single static binary that serves the page and keeps the numbers in one JSON file. Multi-arch image (amd64 and arm64) on `ghcr.io/tombino104/homelab-savings`.
