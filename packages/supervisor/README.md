# supervisor

A limited OTP `supervisor` implementation.

Currently supported strategies include:

* `one_for_one`
* `simple_one_for_one`

## Install

``` sh
npm i @otpjs/supervisor
```

#### Usage

``` javascript
import * as supervisor from '@otpjs/supervisor';
import * as argumentServer from './arguments';
import * as numberServer from './numbers';

const callbacks = {init};

export function startLink(ctx, arg) {
    return supervisor.startLink(ctx, callbacks, [arg, 123])
}

function init(ctx, arg, number) {
    return [
        ok,
        [
            {strategy: one_for_one},
            [
                {
                    id: 'arg-processor',
                    start: [argumentServer.startLink, [arg]]
                },
                {
                    id: 'number-processor',
                    start: [numberServer.startLink, [number]]
                }
            ]
        ]
    ]
}
```
