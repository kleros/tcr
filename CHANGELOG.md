# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.4.0](https://github.com/kleros/tcr/compare/v1.3.1...v1.4.0) (2020-01-24)

### Features

- allow providing evidence for removal requests] ([ff688e8](https://github.com/kleros/tcr/commit/ff688e8))

### [1.3.1](https://github.com/kleros/tcr/compare/v1.3.0...v1.3.1) (2020-01-23)

## [1.3.0](https://github.com/kleros/tcr/compare/v1.2.0...v1.3.0) (2020-01-22)

### Features

- add factory contract ([6906fcb](https://github.com/kleros/tcr/commit/6906fcb))

## [1.2.0](https://github.com/kleros/tcr/compare/v1.1.0...v1.2.0) (2020-01-15)

### Features

- also return the arbitraion cost in fetch arbitrable ([2e3cc06](https://github.com/kleros/tcr/commit/2e3cc06))

## [1.1.0](https://github.com/kleros/tcr/compare/v1.0.3...v1.1.0) (2020-01-14)

### Features

- add flag to not return absent items by default ([e7a7f94](https://github.com/kleros/tcr/commit/e7a7f94))

### [1.0.3](https://github.com/kleros/tcr/compare/v1.0.2...v1.0.3) (2020-01-13)

### [1.0.2](https://github.com/kleros/tcr/compare/v1.0.1...v1.0.2) (2020-01-13)

### Bug Fixes

- incorrect result array instantiation ([8ec75a3](https://github.com/kleros/tcr/commit/8ec75a3))

### [1.0.1](https://github.com/kleros/tcr/compare/v1.0.0...v1.0.1) (2020-01-13)

## [1.0.0](https://github.com/kleros/tcr/compare/v0.1.31...v1.0.0) (2020-01-02)

### Bug Fixes

- review suggestions ([d51a333](https://github.com/kleros/tcr/commit/d51a333))

### [0.1.31](https://github.com/kleros/tcr/compare/v0.1.29...v0.1.31) (2019-12-27)

### Bug Fixes

- incorrect argument and iterator reset ([87b7f85](https://github.com/kleros/tcr/commit/87b7f85))

### Features

- add batch withdraw contract ([8e9215f](https://github.com/kleros/tcr/commit/8e9215f))
- add view function for available rewards ([68b23d7](https://github.com/kleros/tcr/commit/68b23d7))

### [0.1.30](https://github.com/kleros/tcr/compare/v0.1.29...v0.1.30) (2019-12-27)

### Features

- add view function for available rewards ([68b23d7](https://github.com/kleros/tcr/commit/68b23d7))

### [0.1.29](https://github.com/kleros/tcr/compare/v0.1.28...v0.1.29) (2019-12-18)

### [0.1.28](https://github.com/kleros/tcr/compare/v0.1.27...v0.1.28) (2019-12-08)

### Features

- include mapping of evidenceGroupID to requestID ([47f3fdf](https://github.com/kleros/tcr/commit/47f3fdf))

### [0.1.27](https://github.com/kleros/tcr/compare/v0.1.24...v0.1.27) (2019-12-06)

### Features

- include the request type in RequestSubmitted event ([4285f96](https://github.com/kleros/tcr/commit/4285f96))
- make index ItemStatusChange fields and add request status fields ([07f52c1](https://github.com/kleros/tcr/commit/07f52c1))

### [0.1.25](https://github.com/kleros/tcr/compare/v0.1.24...v0.1.25) (2019-12-04)

### Features

- include the request type in RequestSubmitted event ([02bae44](https://github.com/kleros/tcr/commit/02bae44))

### [0.1.24](https://github.com/kleros/tcr/compare/v0.1.21...v0.1.24) (2019-12-01)

### Bug Fixes

- implement clements review suggestions ([5662747](https://github.com/kleros/tcr/commit/5662747))
- implement review suggestions ([0121161](https://github.com/kleros/tcr/commit/0121161))

### [0.1.23](https://github.com/kleros/tcr/compare/v0.1.21...v0.1.23) (2019-11-30)

### Bug Fixes

- implement clements review suggestions ([5662747](https://github.com/kleros/tcr/commit/5662747))
- implement review suggestions ([eb57b6c](https://github.com/kleros/tcr/commit/eb57b6c))

### [0.1.21](https://github.com/kleros/tcr/compare/v0.1.19...v0.1.21) (2019-10-26)

### Features

- return the meta evidence ID for the request ([4ba27ec](https://github.com/kleros/tcr/commit/4ba27ec))

### [0.1.19](https://github.com/kleros/tcr/compare/v0.1.15...v0.1.19) (2019-10-26)

### Bug Fixes

- lock meta evidence and close [#5](https://github.com/kleros/tcr/issues/5) ([08ff5f8](https://github.com/kleros/tcr/commit/08ff5f8))

### Features

- **GTCR.sol:** test file ([#7](https://github.com/kleros/tcr/issues/7)) ([963bf28](https://github.com/kleros/tcr/commit/963bf28))
- emit event on appeal crowdfunding contribution ([7ab6860](https://github.com/kleros/tcr/commit/7ab6860))
- emit event when someone submits a request ([2f52566](https://github.com/kleros/tcr/commit/2f52566))
- save the item's position on the list ([1deb2be](https://github.com/kleros/tcr/commit/1deb2be))
- submit event on item submission ([#9](https://github.com/kleros/tcr/issues/9)) ([5d66530](https://github.com/kleros/tcr/commit/5d66530))

### [0.1.18](https://github.com/kleros/tcr/compare/v0.1.15...v0.1.18) (2019-10-01)

### Features

- **GTCR.sol:** test file ([#7](https://github.com/kleros/tcr/issues/7)) ([963bf28](https://github.com/kleros/tcr/commit/963bf28))
- remove support for EIP165 to avoid complexity ([1e83dbc](https://github.com/kleros/tcr/commit/1e83dbc))
- use kleros libraries instead of local contracts ([64db9fd](https://github.com/kleros/tcr/commit/64db9fd))

### [0.1.15](https://github.com/kleros/tcr/compare/v0.1.14...v0.1.15) (2019-09-14)

### Bug Fixes

- readd item requests and remove simple request ([2d3dd74](https://github.com/kleros/tcr/commit/2d3dd74))

### [0.1.14](https://github.com/kleros/tcr/compare/v0.1.13...v0.1.14) (2019-09-14)

### Features

- save request type in storage for history ([67d8eed](https://github.com/kleros/tcr/commit/67d8eed))

### [0.1.13](https://github.com/kleros/tcr/compare/v0.1.12...v0.1.13) (2019-09-14)

### Bug Fixes

- remove unecessary vars ([834ec94](https://github.com/kleros/tcr/commit/834ec94))
- use a more descriptive function name ([83963d1](https://github.com/kleros/tcr/commit/83963d1))
- wrong page index when there aren't enought items to fill a page ([de1fb2d](https://github.com/kleros/tcr/commit/de1fb2d))

### Features

- add getItemRequests function, docs and remove unused vars ([f14a6d0](https://github.com/kleros/tcr/commit/f14a6d0))
- also return the number of requests and make methods public ([6f48a5b](https://github.com/kleros/tcr/commit/6f48a5b))

### [0.1.12](https://github.com/kleros/tcr/compare/v0.1.11...v0.1.12) (2019-08-28)

### Bug Fixes

- hasMore check ([d92bd42](https://github.com/kleros/tcr/commit/d92bd42))
- incorrect hasMore setting ([31816a0](https://github.com/kleros/tcr/commit/31816a0))

### [0.1.11](https://github.com/kleros/tcr/compare/v0.1.10...v0.1.11) (2019-08-28)

### Features

- return last index if target was not found ([1b8614f](https://github.com/kleros/tcr/commit/1b8614f))

### [0.1.10](https://github.com/kleros/tcr/compare/v0.1.9...v0.1.10) (2019-08-28)

### Bug Fixes

- execution error on queryItems and findIndexFor page for empty tcrs ([ed280da](https://github.com/kleros/tcr/commit/ed280da))

### Features

- add countWithFilter() and return indexFound on findIndexForPage ([04da768](https://github.com/kleros/tcr/commit/04da768))

### [0.1.9](https://github.com/kleros/tcr/compare/v0.1.8...v0.1.9) (2019-08-28)

### Bug Fixes

- queryItems returning only one item with oldestFirst == false ([fd82dc6](https://github.com/kleros/tcr/commit/fd82dc6))

### [0.1.8](https://github.com/kleros/tcr/compare/v0.1.7...v0.1.8) (2019-08-27)

### Features

- add find index for page view function ([c76d288](https://github.com/kleros/tcr/commit/c76d288))

### [0.1.7](https://github.com/kleros/tcr/compare/v0.1.6...v0.1.7) (2019-08-24)

### Bug Fixes

- queryItems iteration ([c85060b](https://github.com/kleros/tcr/commit/c85060b))

### [0.1.6](https://github.com/kleros/tcr/compare/v0.1.5...v0.1.6) (2019-08-23)

### Bug Fixes

- enable optimizer ([60f836b](https://github.com/kleros/tcr/commit/60f836b))
- enable optimizer and remove obsolete instructions ([3d65c9a](https://github.com/kleros/tcr/commit/3d65c9a))

### [0.1.5](https://github.com/kleros/tcr/compare/v0.1.4...v0.1.5) (2019-08-23)

### Bug Fixes

- add/remove missing and obsolete abis ([b62e317](https://github.com/kleros/tcr/commit/b62e317))
- let the package users build the contracts ([3259df1](https://github.com/kleros/tcr/commit/3259df1))

### Features

- emit event on item status change ([c341007](https://github.com/kleros/tcr/commit/c341007))

### [0.1.4](https://github.com/kleros/tcr/compare/v0.1.3...v0.1.4) (2019-08-23)

### Features

- add introspection for the IArbitrable interface ([c5e4bc3](https://github.com/kleros/tcr/commit/c5e4bc3))
- remove unused permission interface ([f5e339b](https://github.com/kleros/tcr/commit/f5e339b))
- use proxy methods to requestStatusChange to avoid accidents ([69948d6](https://github.com/kleros/tcr/commit/69948d6))

### [0.1.3](https://github.com/kleros/tcr/compare/v0.1.2...v0.1.3) (2019-08-23)

### Features

- add view contract and remove obsolete ([26733d4](https://github.com/kleros/tcr/commit/26733d4))

### [0.1.2](https://github.com/kleros/tcr/compare/v0.1.1...v0.1.2) (2019-08-22)

### Features

- add contract abis to package ([1a4d405](https://github.com/kleros/tcr/commit/1a4d405))

### 0.1.1 (2019-08-22)

### Bug Fixes

- **GTCR:** addressing recent issues ([b5483b8](https://github.com/kleros/tcr/commit/b5483b8))
- add missing packages that prevent scripts from running properly ([f62a0ff](https://github.com/kleros/tcr/commit/f62a0ff))
- **GTCR:** removed addItem function ([e7741f7](https://github.com/kleros/tcr/commit/e7741f7))
- **GTCR:** small query items fix ([f927310](https://github.com/kleros/tcr/commit/f927310))

### Features

- **GTCR:** added GTCR contract with dependencies ([504e574](https://github.com/kleros/tcr/commit/504e574))
- include view contracts and upgrade compiler to 0.5.11 ([49d6e26](https://github.com/kleros/tcr/commit/49d6e26))
