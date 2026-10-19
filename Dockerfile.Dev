FROM node:25-bookworm-slim

# Work directory inside the container
WORKDIR /app

# -----------------------------------------------------
# 2) Install system dependencies (FFMPEG!)
# -----------------------------------------------------
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------
# 3) Install dependencies
# -----------------------------------------------------
COPY package*.json ./

# Install deps from lockfile (mirrors local environment exactly)
RUN npm ci

# -----------------------------------------------------
# 4) Copy the rest of the project
# -----------------------------------------------------
COPY . .


# -----------------------------------------------------
# 6) Start Command
# -----------------------------------------------------
# Railway only runs ONE process, so we manually run both:
# - the Remix server
# - your Discord bot
#
# Use a small process manager (node's built-in "&&" would die early,
# but "bash -c" will run both in background properly).
# -----------------------------------------------------

CMD ["bash", "-c", "npm run start:server"]
