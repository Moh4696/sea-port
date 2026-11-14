"""Static server for the Sea Port scene that never lets the browser cache the modules.

    python3 serve.py            # http://localhost:8985/
    python3 serve.py 9000       # another port

Plain `python3 -m http.server` sends Last-Modified but no Cache-Control, so
browsers apply heuristic caching to the ES modules: after an edit, a normal
reload can mix fresh and stale files
"""
import functools, http.server, pathlib, sys

ROOT = pathlib.Path(__file__).parent


class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quiet
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8985
    handler = functools.partial(NoStore, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"serving {ROOT} on http://localhost:{port}/ (no-store)")
        httpd.serve_forever()
