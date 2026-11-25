#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Please install Node.js 20 or newer, then run this launcher again.'
  printf 'Press Enter to close.'
  read -r answer
  exit 1
fi
printf '\nOpen http://127.0.0.1:5173 in your browser.\nKeep this window open while using Myths Map.\n\n'
npm run dev
printf '\nPress Enter to close.'
read -r answer
