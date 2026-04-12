#!/usr/bin/env bash
cd "$(dirname "$0")"

rm -rf archives
npm run archive-map-and-upload -- --subnet <ip6 address goes here> --rps 1000 --rc 250 --loop
