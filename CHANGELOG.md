# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.2] - 2026-07-10

### Added

- micro-interactions, keyboard shortcuts, bulk select, dashboard widgets
- UI/UX improvements — accessibility, filters, responsive panels, dashboard
- series cards collapse by default
- visualization & mobile modernization
- API token guard, health CB ping, graceful shutdown, collections CRUD
- series editor — create/edit series with original + alternate titles

### Fixed

- expose AI tier, score bars, matched-genre reasons + Find Similar
- wire VITE_API_TOKEN into Docker build via ARG
- address code review findings — data integrity, a11y, race conditions
- Couchbase stale connection recovery
- author relationships — books.authors is now [{id, name}] objects
- rating clear, finishedAt tracking, SSRF protection, README credential scrub
