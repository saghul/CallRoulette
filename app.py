
import asyncio
import json
import logging
import mimetypes
import os
import signal
import sys

from aiohttp import web
from aiohttp.log import web_logger, ws_logger

logging.basicConfig(level=logging.DEBUG)
web_logger.setLevel(logging.DEBUG)
ws_logger.setLevel(logging.DEBUG)


BASE_DIR = os.path.dirname(__file__)
STATIC_FILES = os.path.join(BASE_DIR, 'static')
INDEX_FILE = os.path.join(BASE_DIR, 'index.html')


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
                web_logger.warning('Could not load %s file' % self.filename)
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
                web_logger.warning('Could not open %s file' % path)
                raise web.HTTPNotFound()
            self.cache[path] = data, content_type
            web_logger.debug('Loaded file %s (%s)' % (path, content_type))
        return web.Response(body=data, content_type=content_type)


class WebSocketHandler:
    def __init__(self):
        self.connections = set()

    @asyncio.coroutine
    def __call__(self, request):
        ws = web.WebSocketResponse(protocols=('callroulette',))
        ws.start(request)

        self.connections.add(ws)

        data = dict(type='test', data='foo');
        ws.send_str(json.dumps(data));

        while True:
            try:
                data = yield from ws.receive_str()
                data = json.loads(data)
                print(data)
            except web.WSClientDisconnectedError as e:
                ws_logger.info('WS client disconnected: %d:%s' % (e.code, e.message))
                self.connections.remove(ws)
                try:
                    yield from ws.wait_closed()
                except web.WSClientDisconnectedError:
                    pass
                return ws


@asyncio.coroutine
def init(loop):
    app = web.Application(loop=loop)
    app.router.add_route('GET', '/', LazyFileHandler(INDEX_FILE, 'text/html'))
    app.router.add_route('GET', '/ws', WebSocketHandler())
    app.router.add_route('GET', '/static/{path:.*}', StaticFilesHandler(STATIC_FILES))

    handler = app.make_handler()
    server = yield from loop.create_server(handler, '0.0.0.0', 8080)
    print("Server started at http://0.0.0.0:8080")
    return server, handler


loop = asyncio.get_event_loop()
server, handler = loop.run_until_complete(init(loop))
loop.add_signal_handler(signal.SIGINT, loop.stop)
loop.run_forever()

server.close()
tasks = [server.wait_closed(), handler.finish_connections()]
loop.run_until_complete(asyncio.wait(tasks, loop=loop))
del tasks
loop.close()

sys.exit(0)

