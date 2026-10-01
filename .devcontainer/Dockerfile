FROM node:20-bookworm

# build-essential/python3 are required to compile the better-sqlite3 native addon,
# sqlite3 is included for inspecting server/data.db from the terminal.
# iputils-ping provides the ping command used by the Uptime plugin's ICMP check.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    sqlite3 \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
