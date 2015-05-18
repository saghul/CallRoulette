
import asyncio
import json
import logging
import mimetypes
import os
import signal
import sys

from aiohttp import errors, web
from jsonmodels import models, fields
from jsonmodels.errors import ValidationError


logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger('CallRoulette')

BASE_DIR = os.path.dirname(__file__)
STATIC_FILES = os.path.join(BASE_DIR, 'static')
INDEX_FILE = os.path.join(BASE_DIR, 'index.html')

READ_TIMEOUT = 5.0


class LazyFileHandler:
    def __init__(self, filename, content_type):
        self.filename = filename
        self.content_type = content_type
        self.data = None

    @asyncio.coroutine
    def __call__(self, request):
        if self.data is None:
            try:
                with open(self.filename, 'rb') as f:
                    self.data = f.read()
            except IOError:
                log.warning('Could not load %s file' % self.filename)
                raise web.HTTPNotFound()
        return web.Response(body=self.data, content_type=self.content_type)


class StaticFilesHandler:
    def __init__(self, base_path):
        self.base_path = base_path
        self.cache = {}

    @asyncio.coroutine
    def __call__(self, request):
        path = request.match_info['path']
        try:
            data, content_type = self.cache[path]
        except KeyError:
            full_path = os.path.join(self.base_path, path)
            try:
                with open(full_path, 'rb') as f:
                    content_type, encoding = mimetypes.guess_type(full_path, strict=False)
                    data = f.read()
            except IOError:
                log.warning('Could not open %s file' % path)
                raise web.HTTPNotFound()
            self.cache[path] = data, content_type
            log.debug('Loaded file %s (%s)' % (path, content_type))
        return web.Response(body=data, content_type=content_type)


class StringChoiceField(fields.StringField):
    def __init__(self, choices=None, *args, **kw):
        self.choices = choices or []
        super(StringChoiceField, self).__init__(*args, **kw)

    def validate(self, value):
        if value not in self.choices:
            raise ValidationError('invalid choice value')
        super(StringChoiceField, self).validate(value)


class Jsep(models.Base):
    type = StringChoiceField(choices=['offer', 'answer'], required=True)
    sdp = fields.StringField(required=True)


class Candidate(models.Base):
    candidate = fields.StringField(required=True)
    sdpMid = fields.StringField(required=True)
    sdpMLineIndex = fields.IntField(required=True)


class YoPayload(models.Base):
    yo = fields.StringField(required=True)
    jsep = fields.EmbeddedField(Jsep)
    candidate = fields.EmbeddedField(Candidate)


class Connection:
    def __init__(self, ws):
        self.ws = ws
        self._closed = False
        self._closed_fut = asyncio.Future(loop=ws._loop)

    @property
    def closed(self):
        return self._closed or self.ws.closing

    @asyncio.coroutine
    def read(self, timeout=None):
        try:
            msg = yield from asyncio.wait_for(self.ws.receive(), timeout)
        except asyncio.CancelledError:
            # TODO: super-ugly workaround for issue #363
            self.ws._reader._waiter = None
            raise
        except asyncio.TimeoutError:
            log.warning('Timeout reading from socket')
            yield from self.close()
            return ''
        if msg.tp == web.MsgType.text:
            return msg.data
        elif msg.tp == web.MsgType.close:
            log.info('WS client disconnected: %d (%s)' % (self.ws.close_code, self.ws.exception()))
            yield from self.close()
            return ''
        elif msg.tp == web.MsgType.error:
            log.info('WS client error: %r' % msg.data)
            yield from self.close()
            return ''
        else:
            log.info('Unexpected message type "%s", closing connection' % msg.tp)
            yield from self.close()
            return ''

    def write(self, data):
        self.ws.send_str(data)

    @asyncio.coroutine
    def close(self):
        if self._closed:
            return
        if not self.ws.closed:
            try:
                yield from self.ws.close()
            except Exception:
                pass
        self._closed = True
        self._closed_fut.set_result(None)

    @asyncio.coroutine
    def wait_closed(self):
        yield from self._closed_fut


class WebSocketHandler:
    def __init__(self):
        self.waiter = None

    @asyncio.coroutine
    def __call__(self, request):
        ws = web.WebSocketResponse(protocols=('callroulette-v2',))
        ws.start(request)

        conn = Connection(ws)
        if self.waiter is None:
            self.waiter = asyncio.Future(loop=ws._loop)
            fs = [conn.read(), self.waiter]
            done, pending = yield from asyncio.wait(fs, return_when=asyncio.FIRST_COMPLETED)
            if self.waiter not in done:
                # the connection was most likely closed
                self.waiter = None
                return ws
            other = self.waiter.result()
            self.waiter = None
            reading_task = pending.pop()
            reading_task.cancel()
            asyncio.async(self.run_roulette(conn, other))
        else:
            self.waiter.set_result(conn)

        yield from conn.wait_closed()

        return ws

    @asyncio.coroutine
    def run_roulette(self, peerA, peerB):
        log.info('Running roulette: %s, %s' % (peerA, peerB))

        @asyncio.coroutine
        def _close_connections():
            yield from asyncio.wait([peerA.close(), peerB.close()], return_when=asyncio.ALL_COMPLETED)

        def parse(data):
            try:
                data = json.loads(data)
                payload = YoPayload(**data)
                payload.validate()
            except Exception as e:
                log.warning('Error parsing payload: %s' % e)
                return None
            return payload

        # request offer
        offer_request = YoPayload(yo='yo')
        peerA.write(json.dumps(offer_request.to_struct()))

        # get offer
        data = yield from peerA.read(timeout=READ_TIMEOUT)
        if not data:
            yield from _close_connections()
            return

        offer = parse(data)
        if offer is None or offer.jsep is None or offer.jsep.type != 'offer':
            log.warning('Invalid offer received')
            yield from _close_connections()
            return

        # send offer
        peerB.write(json.dumps(offer.to_struct()))

        # wait for answer
        data = yield from peerB.read(timeout=READ_TIMEOUT)
        if not data:
            yield from _close_connections()
            return

        answer = parse(data)
        if answer is None or answer.jsep is None or answer.jsep.type != 'answer':
            log.warning('Invalid answer received')
            yield from _close_connections()
            return

        # dispatch answer
        peerA.write(json.dumps(answer.to_struct()))

        # wait for end
        while True:
            need_close = False
            peer_a_read = asyncio.async(peerA.read())
            peer_a_read.peer = peerA
            peer_a_read.other_peer = peerB

            peer_b_read = asyncio.async(peerB.read())
            peer_b_read.peer = peerB
            peer_b_read.other_peer = peerA

            done, pending = yield from asyncio.wait([peer_a_read, peer_b_read], return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in done:
                data = task.result()
                if not data:
                    break
                # all we can get at this point is trickled ICE candidates
                candidate = parse(data)
                if candidate is None or candidate.candidate is None:
                    log.warning('Invalid candidate received!')
                    break
                task.other_peer.write(json.dumps(candidate.to_struct()))
            else:
                continue
            break

        # close connections
        yield from _close_connections()


@asyncio.coroutine
def init(loop):
    app = web.Application(loop=loop)
    app.router.add_route('GET', '/', LazyFileHandler(INDEX_FILE, 'text/html'))
    app.router.add_route('GET', '/ws', WebSocketHandler())
    app.router.add_route('GET', '/static/{path:.*}', StaticFilesHandler(STATIC_FILES))

    handler = app.make_handler()
    server = yield from loop.create_server(handler, '0.0.0.0', 8080)
    print("Server started at 0.0.0.0:8080")
    return server, handler


loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
server, handler = loop.run_until_complete(init(loop))
loop.add_signal_handler(signal.SIGINT, loop.stop)
loop.run_forever()

server.close()
tasks = [server.wait_closed(), handler.finish_connections()]
loop.run_until_complete(asyncio.wait(tasks, loop=loop))
del tasks
loop.close()

sys.exit(0)

