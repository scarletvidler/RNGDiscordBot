FROM node:25-alpine3.21

# Work directory inside the container
WORKDIR /app

# -----------------------------------------------------
# 2) Install system dependencies (FFMPEG!)
# -----------------------------------------------------
RUN apk update && \
    apk add --no-cache ffmpeg && \
    rm -rf /var/cache/apk/*

# -----------------------------------------------------
# 3) Install dependencies
# -----------------------------------------------------
COPY package*.json ./

# Install production deps only
RUN npm install

# -----------------------------------------------------
# 4) Copy the rest of the project
# -----------------------------------------------------
COPY . .

# -----------------------------------------------------
# 5) Build Remix (your webapp)
# -----------------------------------------------------
RUN npm run build

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

CMD ["bash", "-c", "node server.js & node bot/bot.server.js"]
