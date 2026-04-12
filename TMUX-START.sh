#!/usr/bin/env bash
source $HOME/.bash_profile
cd "$(dirname "$0")"

tmux new-session -d ./START.sh
