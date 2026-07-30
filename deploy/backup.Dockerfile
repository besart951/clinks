FROM postgres:18-alpine

RUN apk add --no-cache restic
COPY deploy/backup.sh /usr/local/bin/clinks-backup
RUN chmod 0555 /usr/local/bin/clinks-backup

USER nobody:nobody
ENTRYPOINT ["/usr/local/bin/clinks-backup"]
