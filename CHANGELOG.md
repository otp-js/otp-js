## 0.17.1 (2022-11-19)


### Bug Fixes

* **serializer-json:** check isNil first 1061359
* **serializer-json:** check isNull first eebfcaf

# 0.17.0 (2022-11-19)


### Bug Fixes

* **gen_server:** better error handling 7e584b7
* **transport-socket.io:** clobbered fixes 1217390


### Features

* **serializer-json:** optional stringify d854a74
* **transports-socket.io:** array buffer support 63203e4
* **transports-socket.io:** leverage no-stringify acbc13a

# 0.16.0 (2022-11-16)


### Features

* **serializer-json:** optional stringify 164ec59

## 0.15.7 (2022-11-12)


### Bug Fixes

* **core:** safe discovery handling for null pid a554f8d

## 0.15.6 (2022-11-11)


### Bug Fixes

* **core:** also clean up bridged nodes 4fe7500
* **transports-socket.io:** fix contain checks a1aa4f7
* **types:** Pid.fromString to convert back 6f8884d

## 0.15.5 (2022-11-11)


### Bug Fixes

* **core:** routersByPid must use string key c2176ac
* **transports-socket.io:** explicit exit on dc c082978
* **transports-socket.io:** fix cost calculation aada6c5
* **transports-socket.io:** type on initial discover e41ee91

## 0.15.4 (2022-11-11)


### Bug Fixes

* **node:** extend discover to include type 95dc773
* **transports-socket.io:** safe unwrapping of pid b5e2031

## 0.15.3 (2022-11-11)


### Bug Fixes

* **core:** always pass lost on 1090a2b

## 0.15.2 (2022-11-11)


### Bug Fixes

* **transport-socket.io:** relaying lost messages 8b6de9e

## 0.15.1 (2022-11-04)


### Bug Fixes

* **core:** check oldPid for null first 3cb4a50

# 0.15.0 (2022-10-08)


### Features

* **test_utils:** pattern matchers for mock calls 23fc936

## 0.14.2 (2022-09-23)


### Bug Fixes

* **core:** move nodedown notice to proper place 6884a9f

## 0.14.1 (2022-09-23)


### Bug Fixes

* **lerna:** useWorkspaces 5881c70
* **transports/tcp:** remove unneeded package-lock 37ee78d

# 0.14.0 (2022-09-23)


### Bug Fixes

* **transports/socket.io:** force handleDisconnect 7e845b6
* **workflows:** explicit job dependencies 16d49dc
* **workflows:** normal install over clean-install 82408c5
* **workflows:** provide NPM_TOKEN to release step d2a9bb0
* **workflows:** return to clean-install 7093c92
* **workflows:** simplify 581bc85


### Features

* **workflows:** depdendent jobs, semantic-release 00ee07a
