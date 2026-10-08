#!/bin/sh
# Compiles TallyStepCleaner with the test runner and runs it on the Mac.
set -e
cd "$(dirname "$0")"
OUT="${TMPDIR:-/tmp}/tally-ai-tests"
swiftc -o "$OUT" ../App/TallyStepCleaner.swift main.swift
"$OUT"
