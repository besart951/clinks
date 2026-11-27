"""Update the bind-mounted nginx configuration in place and reload gracefully."""
import pathlib
import subprocess
import sys

mode = sys.argv[1]
path = pathlib.Path('/srv/codelinks/infra/nginx/production.conf')
previous = path.read_text()
updated = previous
if mode == 'services' and 'server_name api.clinks.ch sync.clinks.ch collab.clinks.ch;' not in previous:
    end = previous.rfind('}')
    assert end > 0 and not previous[end + 1:].strip()
    updated = previous[:end] + """
  server {
    listen 443 ssl;
    http2 on;
    server_name api.clinks.ch sync.clinks.ch collab.clinks.ch;
    ssl_certificate /etc/letsencrypt/live/clinks-services/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clinks-services/privkey.pem;
    client_max_body_size 32m;
    location / {
      set $clinks_edge clinks-web;
      proxy_pass http://$clinks_edge;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-For $remote_addr;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_buffering off;
      proxy_read_timeout 1h;
    }
  }
""" + previous[end:]
elif mode == 'web':
    original = '    location / {\n      proxy_pass http://codelinks_api;'
    target = '    location / {\n      set $clinks_edge clinks-web;\n      proxy_pass http://$clinks_edge;'
    if target not in previous:
        if previous.count(original) != 1:
            sys.exit('Unexpected www root configuration')
        updated = previous.replace(original, target)
if updated != previous:
    backup = pathlib.Path('/srv/clinks') / ('nginx-before-' + mode + '.conf')
    if not backup.exists():
        backup.write_text(previous)
    nginx = ['docker', 'exec', 'codelinks-nginx-1', 'nginx']
    try:
        path.write_text(updated)
        subprocess.run(nginx + ['-t'], check=True)
        subprocess.run(nginx + ['-s', 'reload'], check=True)
    except BaseException:
        path.write_text(previous)
        subprocess.run(nginx + ['-s', 'reload'], check=False)
        raise
