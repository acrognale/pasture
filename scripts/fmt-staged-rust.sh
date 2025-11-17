#!/bin/bash

diff=$(cargo fmt --manifest-path ./apps/desktop/src-tauri/Cargo.toml -- --check)
result=$?

if [[ ${result} -ne 0 ]] ; then
    cat <<\EOF
There are some code style issues, run `cargo fmt` first.
EOF
    exit 1
fi

exit 0