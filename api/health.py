from http_utils import JsonHandler


class handler(JsonHandler):
    def do_GET(self):
        self.send_json({"status": "ok", "message": "API is working"})
