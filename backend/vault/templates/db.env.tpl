{{ with secret "database/creds/library-backend" }}
CB_USERNAME={{ .Data.username }}
CB_PASSWORD={{ .Data.password }}
{{ end }}
