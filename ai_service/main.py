# c:/wise/ai_service/main.py
# Python microservice for AI receipt parsing.
# Uses Python standard library only (zero external dependencies like FastAPI or requests required).
# Listens on port 5000 and forwards requests to Gemini API.

import os
import json
import base64
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

class AIParseHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Redirect logging to stdout clearly
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

            # Read image bytes
            image_bytes = self.rfile.read(content_length)

            # Get API Key
            api_key = os.environ.get("GEMINI_API_KEY")
            if not api_key:
                # Try loading from .env manually if running standalone
                api_key = self.load_api_key_from_env_file()

            if not api_key:
                print("[AI Service] WARNING: GEMINI_API_KEY not found in environment. Returning mock data status.")
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
        # Look in backend/.env or parent .env
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

        prompt = """You are a precise receipt OCR parser. Extract all line items from this receipt image.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "restaurant": string or null,
  "items": [{"name": string, "price": number, "quantity": integer, "emoji": string}],
  "subtotal": number,
  "tax": number,
  "tip": number,
  "total": number,
  "confidence": number
}

Rules:
- price = unit price (not multiplied by quantity)
- quantity = number of that item ordered
- emoji = single relevant food emoji for the item
- confidence = 0.0 to 1.0 (how confident you are in the parse)
- All amounts in the currency shown (do not convert)
- If tax/tip not shown, use 0"""

        payload = {
            "contents": [{
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": b64_image
                        }
                    },
                    {"text": prompt}
                ]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "topP": 0.95,
                "responseMimeType": "application/json"
            }
        }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
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
                
                # Extract text
                parts = gemini_resp["candidates"][0]["content"]["parts"]
                raw_json = parts[0]["text"]
                
                # Parse output
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
    httpd = HTTPServer(server_address, AIParseHandler)
    print(f"[AI Service] Running on http://localhost:{port}...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("[AI Service] Stopping server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
