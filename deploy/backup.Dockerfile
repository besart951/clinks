FROM alpine:3.22

RUN apk add --no-cache postgresql18-client restic
COPY deploy/backup.sh /usr/local/bin/clinks-backup
RUN chmod 0555 /usr/local/bin/clinks-backup

USER nobody:nobody
ENTRYPOINT ["/usr/local/bin/clinks-backup"]
