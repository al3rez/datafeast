#!/usr/bin/env bash
set -euo pipefail

target=${1:?usage: store-stripe-secret.sh TARGET}
secret=""
while IFS= read -r line; do
  if [[ "$line" =~ ^(sk|rk)_(test|live)_[A-Za-z0-9_]+$ ]]; then
    secret=$line
  fi
done

if [[ -z "$secret" ]]; then
  echo "Refusing to store an invalid Stripe API key." >&2
  exit 1
fi

target_dir=$(dirname "$target")
mkdir -p "$target_dir"
chmod 700 "$target_dir"
umask 077
temporary="${target}.tmp.$$"
printf '%s' "$secret" > "$temporary"
chmod 600 "$temporary"
mv "$temporary" "$target"
echo "Stored Stripe credential with mode 600."
