# c:/wise/ai_service/main.py
# Python microservice for AI receipt parsing.
# Uses Python standard library only.
# Listens on port 5000 and forwards requests to Gemini API.

import os
import json
import base64
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

PROMPT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompt.txt")

def load_prompt():
    with open(PROMPT_PATH, "r", encoding="utf-8") as f:
        return f.read().strip()

RECEIPT_PROMPT = load_prompt()


class AIParseHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[AI Service] {format%args}")

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "service": "ai_service"}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/parse":
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_error_response(400, "Empty request body")
                return

            image_bytes = self.rfile.read(content_length)

            api_key = os.environ.get("GEMINI_API_KEY")
            if not api_key:
                api_key = self.load_api_key_from_env_file()

            if not api_key:
                print("[AI Service] WARNING: GEMINI_API_KEY not found. Returning error.")
                self.send_error_response(401, "GEMINI_API_KEY not set")
                return

            try:
                result = self.call_gemini(image_bytes, api_key)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                print(f"[AI Service] ERROR: Failed to call Gemini: {e}")
                self.send_error_response(500, f"Gemini error: {str(e)}")
        else:
            self.send_response(404)
            self.end_headers()

    def send_error_response(self, code, message):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode("utf-8"))

    def load_api_key_from_env_file(self):
        paths = ["../backend/.env", ".env", "backend/.env"]
        for p in paths:
            if os.path.exists(p):
                with open(p, "r") as f:
                    for line in f:
                        if line.strip().startswith("GEMINI_API_KEY="):
                            return line.strip().split("=", 1)[1].strip()
        return None

    def call_gemini(self, image_bytes, api_key):
        b64_image = base64.b64encode(image_bytes).decode("utf-8")

        model = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")

        payload = {
            "contents": [{
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": b64_image
                        }
                    },
                    {"text": RECEIPT_PROMPT}
                ]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "topP": 0.95,
                "responseMimeType": "application/json"
            }
        }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                resp_body = response.read().decode("utf-8")
                gemini_resp = json.loads(resp_body)

                parts = gemini_resp["candidates"][0]["content"]["parts"]
                raw_json = parts[0]["text"]

                parsed = json.loads(raw_json)
                parsed["is_mock"] = False
                return parsed
        except urllib.error.HTTPError as e:
            err_content = e.read().decode("utf-8")
            raise Exception(f"HTTP {e.code}: {err_content}")
        except Exception as e:
            raise Exception(f"Failed to communicate with Gemini: {e}")

def run_server(port=5000):
    server_address = ('', port)
    httpd = ThreadingHTTPServer(server_address, AIParseHandler)
    print(f"[AI Service] Running on http://localhost:{port} (threaded)...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("[AI Service] Stopping server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
