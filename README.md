
# CallRoulette

## Overview and motivation

CallRoulette is a simple web application for experimenting with WebRTC technologies using Python
on the backend. It was initially coded for the [Python FOSDEM devroom](http://python-fosdem.org/)
but it has since been further enhanced.

The backend uses [asyncio](https://docs.python.org/3/library/asyncio.html) and
[aiohttp](http://aiohttp.readthedocs.org). The frontend uses pretty much vanilla JavaScript with
[rtcninja](https://github.com/eface2face/rtcninja.js) as the WebRTC adapter.


## Protocol

### V1 - (not really) SIP

The protocol for communicating clients is dead simple: a WebSocket connection is used with 3 types
of messages: 'offre_request', 'offer' and 'answer'. There is no message to end the communication,
this is intentional, in order to keep it as simple as possible.

SIP: Saghul's Imbecile Protocol

![SIP](https://raw.githubusercontent.com/saghul/CallRoulette/master/sip.jpg)

### V2 - yo

The yo protocol is an improvement over (not really) SIP used in version 1. It maintains the original
spirit of simplicity (only 4 message types), but it uses [Trickle ICE](https://webrtchacks.com/trickle-ice/).


## Author

Saúl Ibarra Corretgé <saghul@gmail.com>


## License

MIT (check the LICENSE file)


## Thanks

- Iñaki Baz Castillo <ibc@aliax.net>: for [rtcninja](https://github.com/eface2face/rtcninja.js)
  and helping me with JavaScript.
- The aiohttp authors: for making it really easy to mix HTTP servers with WebSockets in
  asyncio.

