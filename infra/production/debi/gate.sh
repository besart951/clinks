#!/bin/bash
set -eu
[[ ${SSH_ORIGINAL_COMMAND:-} =~ ^(providers|release)\ ([0-9a-f]{40})$ ]] || exit 2
exec sudo -n /usr/local/sbin/clinks-receive "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
