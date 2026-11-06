MODEL=x
curl -sS -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"count 1 to 3, one per line\"}],\"stream\":true,\"max_tokens\":40}" http://127.0.0.1:1/x
