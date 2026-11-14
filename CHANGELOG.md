# Changelog

## [0.8.0](https://github.com/sondresjolyst/blobby-volley-tournament/compare/v0.7.0...v0.8.0) (2026-11-14)


### Features

* set a per-request nonce in the Content-Security-Policy ([#114](https://github.com/sondresjolyst/blobby-volley-tournament/issues/114)) ([81d65a4](https://github.com/sondresjolyst/blobby-volley-tournament/commit/81d65a402537336c5f3ef8e84a3761a0fe0ec713))
* show a busy label on the submit button while a form posts ([#108](https://github.com/sondresjolyst/blobby-volley-tournament/issues/108)) ([3d399ea](https://github.com/sondresjolyst/blobby-volley-tournament/commit/3d399ead3b084f8d2354b764a21bb7de0a74747d))


### Bug Fixes

* add error pages, stricter headers and session cleanup ([#113](https://github.com/sondresjolyst/blobby-volley-tournament/issues/113)) ([3d27e5f](https://github.com/sondresjolyst/blobby-volley-tournament/commit/3d27e5f190d469591142f5c93b50233e3e35b2c5))
* say the game needs macOS 26 or newer on the download page ([#109](https://github.com/sondresjolyst/blobby-volley-tournament/issues/109)) ([1fee812](https://github.com/sondresjolyst/blobby-volley-tournament/commit/1fee812435307116463ebe1707eacfa7951d5fc5))

## [0.7.0](https://github.com/sondresjolyst/blobby-volley-tournament/compare/v0.6.0...v0.7.0) (2026-11-10)


### Features

* add a download page for the game ([#94](https://github.com/sondresjolyst/blobby-volley-tournament/issues/94)) ([81c8583](https://github.com/sondresjolyst/blobby-volley-tournament/commit/81c85836d7096ba0b09143997814df9fac290bb5))
* **admin:** page and search the players and matches lists and line up the admin event rows ([#92](https://github.com/sondresjolyst/blobby-volley-tournament/issues/92)) ([28dcd4b](https://github.com/sondresjolyst/blobby-volley-tournament/commit/28dcd4b43919ee5d127693ad8995875696782c2f))
* **big-screen:** add a 1v1 screen with the live and latest 1v1 matches and the next tournament matches ([#91](https://github.com/sondresjolyst/blobby-volley-tournament/issues/91)) ([25e3736](https://github.com/sondresjolyst/blobby-volley-tournament/commit/25e3736a4c8bb7af15a5813a15dc131ac0879983))
* explain the Elo rating to players ([#104](https://github.com/sondresjolyst/blobby-volley-tournament/issues/104)) ([8928948](https://github.com/sondresjolyst/blobby-volley-tournament/commit/89289485d7ba18f90ee2be8aa65a8ac4ed06d9b5))
* keep the sponsor strip at the bottom of the window ([#86](https://github.com/sondresjolyst/blobby-volley-tournament/issues/86)) ([d040d2e](https://github.com/sondresjolyst/blobby-volley-tournament/commit/d040d2e2061f19935249fc08c6a512607aa2ec7d))
* let players train against a bot on the game server ([#95](https://github.com/sondresjolyst/blobby-volley-tournament/issues/95)) ([548e6f2](https://github.com/sondresjolyst/blobby-volley-tournament/commit/548e6f2b0327e410f9ef0ef5a35de25763baf219))
* make player accounts global across LANs ([#105](https://github.com/sondresjolyst/blobby-volley-tournament/issues/105)) ([433fcd1](https://github.com/sondresjolyst/blobby-volley-tournament/commit/433fcd10c1b6046be0064a41e536cd4d76fd5e3e))
* pick the game rules from a list for tournament rounds and 1v1 matches ([#90](https://github.com/sondresjolyst/blobby-volley-tournament/issues/90)) ([4924f60](https://github.com/sondresjolyst/blobby-volley-tournament/commit/4924f601b3eee55010871b9f0fca2f97c6321fbf))
* show live matches and trainings under I ringen nå on /me ([#98](https://github.com/sondresjolyst/blobby-volley-tournament/issues/98)) ([0500a2d](https://github.com/sondresjolyst/blobby-volley-tournament/commit/0500a2def1f4dc595ba10ae998a86bd54877abf9))
* sort the training bots from easy to hard and show how hard each one is ([#99](https://github.com/sondresjolyst/blobby-volley-tournament/issues/99)) ([39c7477](https://github.com/sondresjolyst/blobby-volley-tournament/commit/39c747788e6ef9a1a5f5e3ff0fca95f4de75ad2f))
* tell the player on /me when they got the daily Foza for today ([#84](https://github.com/sondresjolyst/blobby-volley-tournament/issues/84)) ([3a84721](https://github.com/sondresjolyst/blobby-volley-tournament/commit/3a84721791193fe72860d302d3f6cd534b004e38))


### Bug Fixes

* keep the scroll position when a form is sent ([#89](https://github.com/sondresjolyst/blobby-volley-tournament/issues/89)) ([851c808](https://github.com/sondresjolyst/blobby-volley-tournament/commit/851c8088cd9e2d55ae4e198d0ebf9a7962e33520))
* keep the sponsor strip moving at every screen width ([#85](https://github.com/sondresjolyst/blobby-volley-tournament/issues/85)) ([c8bee6a](https://github.com/sondresjolyst/blobby-volley-tournament/commit/c8bee6a0fc604b229276c3462ce417a3935fa96c))
* line up the difficulty field with the points field in the training form ([#96](https://github.com/sondresjolyst/blobby-volley-tournament/issues/96)) ([cd15534](https://github.com/sondresjolyst/blobby-volley-tournament/commit/cd15534b70e301c8d92a7c02f1295643decaa985))
* save the training texts as UTF-8 ([#97](https://github.com/sondresjolyst/blobby-volley-tournament/issues/97)) ([85864a9](https://github.com/sondresjolyst/blobby-volley-tournament/commit/85864a9a03d1df8dafa4a9f0841d19e08b8ed688))
* show only the game title on the download page ([#101](https://github.com/sondresjolyst/blobby-volley-tournament/issues/101)) ([b19eaa8](https://github.com/sondresjolyst/blobby-volley-tournament/commit/b19eaa847717ca2b51c61bf23f3a324730e7777a))
* tell players to press join or Enter and keep the menu on one row on phones ([#100](https://github.com/sondresjolyst/blobby-volley-tournament/issues/100)) ([429256a](https://github.com/sondresjolyst/blobby-volley-tournament/commit/429256a453c5a6ad1fa823ac83af31a1dc3e3b25))
* use the same words across the player and admin pages ([#106](https://github.com/sondresjolyst/blobby-volley-tournament/issues/106)) ([7aa9f9c](https://github.com/sondresjolyst/blobby-volley-tournament/commit/7aa9f9c6202da21f5d0acf8ad0589492be959711))

## [0.6.0](https://github.com/sondresjolyst/blobby-volley-tournament/compare/v0.5.0...v0.6.0) (2026-11-08)


### Features

* add the Pizzakongen trophy set and two alternative trophies ([#27](https://github.com/sondresjolyst/blobby-volley-tournament/issues/27)) ([0835354](https://github.com/sondresjolyst/blobby-volley-tournament/commit/0835354be4d5d1c44013ce242db8cd81493eeb71))


### Bug Fixes

* make the site texts clearer and consistent ([#80](https://github.com/sondresjolyst/blobby-volley-tournament/issues/80)) ([f11fb72](https://github.com/sondresjolyst/blobby-volley-tournament/commit/f11fb72004670bad677d756d1a60c2d746a7ca78))
* put the token button on its own line below the confirm box ([#83](https://github.com/sondresjolyst/blobby-volley-tournament/issues/83)) ([ec8c4c8](https://github.com/sondresjolyst/blobby-volley-tournament/commit/ec8c4c8fa038b00d69c7d88dd656b7edf03b9522))
* show the sponsors as a moving strip of design tiles with centred logos ([#82](https://github.com/sondresjolyst/blobby-volley-tournament/issues/82)) ([9f2b2af](https://github.com/sondresjolyst/blobby-volley-tournament/commit/9f2b2afa824124bcc0fc8aae10fd0a4d3ae188c4))

## [0.5.0](https://github.com/sondresjolyst/blobby-volley-tournament/compare/v0.4.0...v0.5.0) (2026-11-08)


### Features

* add a sponsor library that every event can use ([#75](https://github.com/sondresjolyst/blobby-volley-tournament/issues/75)) ([6d589c0](https://github.com/sondresjolyst/blobby-volley-tournament/commit/6d589c0bdf06eba67de98a6083d1896e5315b825))
* add admin PIN unlock, network PIN limit reset and live game server health ([#61](https://github.com/sondresjolyst/blobby-volley-tournament/issues/61)) ([a65700a](https://github.com/sondresjolyst/blobby-volley-tournament/commit/a65700a0d2bfaa01904871ed64d9b325dfc29418))
* add big screen types that take turns on the TV ([#63](https://github.com/sondresjolyst/blobby-volley-tournament/issues/63)) ([0658c20](https://github.com/sondresjolyst/blobby-volley-tournament/commit/0658c20a2e0f3313f713a25bd157e50a1e1158b4))
* add help buttons, the leaderboard menu and sign-out in every player header ([#72](https://github.com/sondresjolyst/blobby-volley-tournament/issues/72)) ([a60ff69](https://github.com/sondresjolyst/blobby-volley-tournament/commit/a60ff69d8a03242280c28ded81d278eaac4cbdad))
* add the pizza as the browser tab icon ([#58](https://github.com/sondresjolyst/blobby-volley-tournament/issues/58)) ([5a15771](https://github.com/sondresjolyst/blobby-volley-tournament/commit/5a157714bd607059aa7cb65d46f5b54a0d90b1e5))
* call a 1v1 match as soon as it is accepted and both players are free ([#67](https://github.com/sondresjolyst/blobby-volley-tournament/issues/67)) ([c4bf278](https://github.com/sondresjolyst/blobby-volley-tournament/commit/c4bf278e9563c4b7877d8bf7614d395e23abe77c))
* frame every sponsor tile and use the sponsor background colour on the site ([#74](https://github.com/sondresjolyst/blobby-volley-tournament/issues/74)) ([89f2b68](https://github.com/sondresjolyst/blobby-volley-tournament/commit/89f2b6899c0f13781b9fa0f566522d57dfa80567))
* redesign the admin sponsor section as cards with one add and edit form ([#73](https://github.com/sondresjolyst/blobby-volley-tournament/issues/73)) ([7ca7006](https://github.com/sondresjolyst/blobby-volley-tournament/commit/7ca7006468b387e4d2e0aa88489570ccba5440cc))
* refresh the player pages when the event changes ([#71](https://github.com/sondresjolyst/blobby-volley-tournament/issues/71)) ([a4167bf](https://github.com/sondresjolyst/blobby-volley-tournament/commit/a4167bf232cdd8cbc15e52cf2e648f490b884790))
* show one start command on the game server page ([#68](https://github.com/sondresjolyst/blobby-volley-tournament/issues/68)) ([5087b50](https://github.com/sondresjolyst/blobby-volley-tournament/commit/5087b5000b99ab81bfaf878a0e7ae8557f5909b8))
* suggest and generate event codes, explain the game server host and let admins change it ([#66](https://github.com/sondresjolyst/blobby-volley-tournament/issues/66)) ([379d981](https://github.com/sondresjolyst/blobby-volley-tournament/commit/379d98149463d44edcb58de5734e6a0112072b2d))


### Bug Fixes

* add per-client PIN and sign-up limits and update the game server commands ([#60](https://github.com/sondresjolyst/blobby-volley-tournament/issues/60)) ([9f53dee](https://github.com/sondresjolyst/blobby-volley-tournament/commit/9f53deeb7963fe64e340e1e2154fca8e56e24d3c))
* keep the header title and links readable on hover ([#70](https://github.com/sondresjolyst/blobby-volley-tournament/issues/70)) ([cc6f472](https://github.com/sondresjolyst/blobby-volley-tournament/commit/cc6f472654f20722d3074b2600395b58eed95cde))
* make the dialect texts consistent ([#69](https://github.com/sondresjolyst/blobby-volley-tournament/issues/69)) ([c8cba88](https://github.com/sondresjolyst/blobby-volley-tournament/commit/c8cba88d07e9af5521338cd299cb54bd9f0ef4c8))
* shorten texts on the front and join pages ([#65](https://github.com/sondresjolyst/blobby-volley-tournament/issues/65)) ([7d77861](https://github.com/sondresjolyst/blobby-volley-tournament/commit/7d77861aef5017e4e80af96516958641d30b601f))
* time out database connections and handle dropped idle connections ([#64](https://github.com/sondresjolyst/blobby-volley-tournament/issues/64)) ([f956d7f](https://github.com/sondresjolyst/blobby-volley-tournament/commit/f956d7f65be7bb268c96055be5698198e309b391))

## [0.4.0](https://github.com/sondresjolyst/blobby-volley-tournament/compare/v0.3.0...v0.4.0) (2026-11-07)


### Features

* polish the pizza theme and the admin pages ([#57](https://github.com/sondresjolyst/blobby-volley-tournament/issues/57)) ([e51d88f](https://github.com/sondresjolyst/blobby-volley-tournament/commit/e51d88ff4502ac0a578f46df18dba13e18e73bf7))


### Dependencies

* **docker:** update node from 26.12.1-slim to 26.13.0-slim ([f2a95ea](https://github.com/sondresjolyst/blobby-volley-tournament/commit/f2a95ea2c538d8348c60f21f10d2e54d596d5560))

## [0.3.0](https://github.com/sondresjolyst/blobby-volley-tournament/compare/v0.2.0...v0.3.0) (2026-11-07)


### Features

* style the front page, sign-in and admin pages ([#50](https://github.com/sondresjolyst/blobby-volley-tournament/issues/50)) ([408a7b1](https://github.com/sondresjolyst/blobby-volley-tournament/commit/408a7b15745936886a34ae585ca40d07f9075933))

## [0.2.0](https://github.com/sondresjolyst/blobby-volley-tournament/compare/v0.1.0...v0.2.0) (2026-11-07)


### Features

* set the pause between games in a series ([#47](https://github.com/sondresjolyst/blobby-volley-tournament/issues/47)) ([c8464a0](https://github.com/sondresjolyst/blobby-volley-tournament/commit/c8464a0bfd5c20e2fab197f7d16fdc5a17509c99))
* show matches waiting for an admin decision ([#46](https://github.com/sondresjolyst/blobby-volley-tournament/issues/46)) ([34d14f3](https://github.com/sondresjolyst/blobby-volley-tournament/commit/34d14f3cdde06e4050e0216b6262b94d9d74c26c))

## 0.1.0 (2026-11-07)


### Features

* add admin login with GitHub ([#14](https://github.com/sondresjolyst/blobby-volley-tournament/issues/14)) ([45847e8](https://github.com/sondresjolyst/blobby-volley-tournament/commit/45847e8a83197fa22104c9c7eff9732985f5e08b))
* add an admin setting for the in-game sponsor board style ([#31](https://github.com/sondresjolyst/blobby-volley-tournament/issues/31)) ([03fea26](https://github.com/sondresjolyst/blobby-volley-tournament/commit/03fea26cabeb1fe6b2b0bc8619e9a7cebf94c3fb))
* add bracket engine ([#21](https://github.com/sondresjolyst/blobby-volley-tournament/issues/21)) ([09c4f31](https://github.com/sondresjolyst/blobby-volley-tournament/commit/09c4f31828472cc78a58f67d09a6fae30bbd8e51))
* add events and player sign-up ([#16](https://github.com/sondresjolyst/blobby-volley-tournament/issues/16)) ([96faa5f](https://github.com/sondresjolyst/blobby-volley-tournament/commit/96faa5f0acbf019ce0ef5f247e49476a77e67157))
* add Foza and betting ([#23](https://github.com/sondresjolyst/blobby-volley-tournament/issues/23)) ([e9e9d9e](https://github.com/sondresjolyst/blobby-volley-tournament/commit/e9e9d9ef934a16a506046c55610aeef4f53a48f1))
* add game server API ([#25](https://github.com/sondresjolyst/blobby-volley-tournament/issues/25)) ([98d2870](https://github.com/sondresjolyst/blobby-volley-tournament/commit/98d28708cdff12659886b12893c600ec9186de6c))
* add leaderboards, stats and Elo ratings ([#28](https://github.com/sondresjolyst/blobby-volley-tournament/issues/28)) ([76d623d](https://github.com/sondresjolyst/blobby-volley-tournament/commit/76d623d80dcbd432724605db39e3db06fa4fac0b))
* add match lifecycle and management ([#22](https://github.com/sondresjolyst/blobby-volley-tournament/issues/22)) ([9bd24e4](https://github.com/sondresjolyst/blobby-volley-tournament/commit/9bd24e4035ebb75bbb9f1bb1e1e42889058a1504))
* add player pages ([#30](https://github.com/sondresjolyst/blobby-volley-tournament/issues/30)) ([2e7d5de](https://github.com/sondresjolyst/blobby-volley-tournament/commit/2e7d5de9817a65353c0ed5209109084b904f9960))
* add sponsor management ([#26](https://github.com/sondresjolyst/blobby-volley-tournament/issues/26)) ([6fb7028](https://github.com/sondresjolyst/blobby-volley-tournament/commit/6fb702858d5887861aa5cd8e825cb135a4e279b3))
* add the big-screen page ([#34](https://github.com/sondresjolyst/blobby-volley-tournament/issues/34)) ([02d4956](https://github.com/sondresjolyst/blobby-volley-tournament/commit/02d49562c3be11d4de8cd6d2858c82e4ca136143))
* copy the join link and show how to use it ([#36](https://github.com/sondresjolyst/blobby-volley-tournament/issues/36)) ([d891daf](https://github.com/sondresjolyst/blobby-volley-tournament/commit/d891daf1a02e8df62b5b72e459fd6e158bf62faf))
* generate the big screen key on the admin page ([#42](https://github.com/sondresjolyst/blobby-volley-tournament/issues/42)) ([e9b38ff](https://github.com/sondresjolyst/blobby-volley-tournament/commit/e9b38ffe588c9baf3ec20a946c2edd8444a0ce9c))
* generate the game server token on the admin page ([#43](https://github.com/sondresjolyst/blobby-volley-tournament/issues/43)) ([8d33ad5](https://github.com/sondresjolyst/blobby-volley-tournament/commit/8d33ad54f2daf7c6b1f754e42112078cd6391128))
* hide the join card on the big screen without a key ([#37](https://github.com/sondresjolyst/blobby-volley-tournament/issues/37)) ([a18c860](https://github.com/sondresjolyst/blobby-volley-tournament/commit/a18c860a094a4d95d3e56a117a90f12555d0fa35))
* send the series score in the game server sync ([#35](https://github.com/sondresjolyst/blobby-volley-tournament/issues/35)) ([f078fa5](https://github.com/sondresjolyst/blobby-volley-tournament/commit/f078fa586d042dbd69425ff2d6e526650c5fe669))
