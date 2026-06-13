{{ with secret "kv/data/library/external" }}
GOOGLE_BOOKS_API_KEY={{ .Data.data.google_books_api_key }}
{{ end }}
