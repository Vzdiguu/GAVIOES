from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
from urllib.request import Request, urlopen

ROOT = Path(__file__).parent.resolve()

class StaticRouteHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        raw_path = unquote(urlsplit(path).path)
        if raw_path == "/":
            candidate = ROOT / "index.html"
        else:
            relative = raw_path.lstrip("/")
            candidate = ROOT / relative
            if not candidate.is_file() and not Path(relative).suffix:
                # Prefer route directories so extensionless URLs use the maintained page.
                index_candidate = ROOT / relative / "index.html"
                html_candidate = ROOT / f"{relative}.html"
                if index_candidate.is_file():
                    candidate = index_candidate
                elif html_candidate.is_file():
                    candidate = html_candidate
        return str(candidate)

    def do_POST(self):
        if urlsplit(self.path).path == '/api/capture-agenda':
            try:
                length = int(self.headers.get('Content-Length', '0'))
                payload = self.rfile.read(length)
                (ROOT / 'agenda-capture.json').write_bytes(payload)
                self.send_response(204)
                self.end_headers()
            except Exception as error:
                self.send_error(500, f'Agenda capture failed: {error}')
            return
        # Proxy restrito para a busca oficial de unidades por cidade/CEP.
        if urlsplit(self.path).path != '/api/locations':
            self.send_error(404, 'Proxy endpoint not found')
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            payload = self.rfile.read(length)
            upstream = Request(
                'https://www.academiagavioes.com.br/location',
                data=payload,
                headers={
                    'Content-Type': self.headers.get('Content-Type', 'application/x-www-form-urlencoded'),
                    'User-Agent': 'Gavioes-Units-Proxy/1.0',
                    'Accept': 'application/json, text/plain, */*',
                },
                method='POST',
            )
            with urlopen(upstream, timeout=15) as response:
                body = response.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as error:
            self.send_error(502, f'Location proxy failed: {error}')

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            fallback = ROOT / "404.html"
            if fallback.is_file():
                self.path = "/404.html"
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                body = fallback.read_bytes()
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        super().send_error(code, message, explain)

    def log_message(self, format, *args):
        print(f"{self.address_string()} - {format % args}")

if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 3000), StaticRouteHandler)
    print("Serving", ROOT, "on port 3000", flush=True)
    server.serve_forever()
