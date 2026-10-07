### Unreleased

- change: read only Address fields common to Haraka < 3.2 and >= 3.2 (host, user)
- fix: null sender is reported as an empty sender, a sender without domain as its local part (as abusix_ppd does)
- fix: clients without usable rDNS (NXDOMAIN, DNSERROR) are reported as `unknown`
- fix: never log the feed key
- fix: close the UDP socket on shutdown; socket errors are logged instead of thrown
- test: convert test runner to node:test, test-fixtures 1.7
- dep(eslint): upgrade to v9 (flat config, @haraka/eslint-config)


### [1.1.0] - 2023-12-15

#### Added

- 

#### Fixed

- 

#### Changed

- 


## 1.0.0 - 2023-12-14

- Initial release
[1.1.0]: /releases/tag/1.1.0
