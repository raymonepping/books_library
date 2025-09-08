#!/bin/bash
curl -fsSL http://127.0.0.1:8200/v1/sys/health | grep "\"sealed\":false" > /dev/null
exit $?
