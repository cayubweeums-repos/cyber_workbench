FROM node:20-slim

ENV LD_LIBRARY_PATH=/usr/local/lib
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install Docker CLI + guacamole-server build dependencies (includes guacenc)
RUN apt-get update && \
    apt-get install -y ca-certificates curl && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && \
    chmod a+r /etc/apt/keyrings/docker.asc && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y docker-ce-cli && \
    apt-get install -y \
        build-essential \
        libcairo2-dev \
        libjpeg-dev \
        libpng-dev \
        libtool-bin \
        libossp-uuid-dev \
        libavcodec-dev \
        libavformat-dev \
        libavutil-dev \
        libswscale-dev \
        libwebp-dev \
        ffmpeg \
        wget && \
    rm -rf /var/lib/apt/lists/*

# Build guacamole-server (includes guacenc for recording conversion)
RUN wget -O guacamole-server.tar.gz "https://downloads.apache.org/guacamole/1.6.0/source/guacamole-server-1.6.0.tar.gz" && \
    tar -xzf guacamole-server.tar.gz && \
    cd guacamole-server-1.6.0 && \
    ./configure --with-init-dir=/etc/init.d && \
    make && \
    make install && \
    ldconfig && \
    cd / && \
    rm -rf guacamole-server-1.6.0 guacamole-server.tar.gz

# Copy package files
COPY package.json .

# Install dependencies
RUN npm install --production

# Copy application files
COPY server.js .
COPY api/ ./api/
COPY services/ ./services/
COPY utils/ ./utils/

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "server.js"]

