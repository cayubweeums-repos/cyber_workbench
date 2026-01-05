# syntax=docker/dockerfile:1

# Global ARG must be defined before any FROM
ARG VERSION_ARG="VapiorC"

# Stage: Build the Guacamole NoAuth extension
FROM maven:3.9-eclipse-temurin-11 AS extension-builder

COPY guacamole-extension /extension
WORKDIR /extension
RUN mvn clean package -q

FROM scratch AS build-amd64

COPY --from=qemux/qemu:7.27 / /

ARG TARGETARCH
ARG GUACAMOLE_VERSION="1.6.0"
ARG DEBCONF_NOWARNINGS="yes"
ARG DEBIAN_FRONTEND="noninteractive"
ARG DEBCONF_NONINTERACTIVE_SEEN="true"

RUN set -eu && \
    apt-get update && \
    apt-get --no-install-recommends -y install \
        samba \
        wimtools \
        dos2unix \
        cabextract \
        libxml2-utils \
        libarchive-tools \
        python3 \
        python3-pip \
        supervisor \
        curl \
        wget \
        unzip && \
    wget "https://github.com/gershnik/wsdd-native/releases/download/v1.22/wsddn_1.22_${TARGETARCH}.deb" -O /tmp/wsddn.deb -q && \
    dpkg -i /tmp/wsddn.deb && \
    pip3 install --no-cache-dir --break-system-packages flask==3.0.0 flask-cors==4.0.0 waitress==3.0.0 && \
    mkdir -p /etc/guacamole /guac-transfer /var/log/guacamole /tmp/qga /tmp/qmp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install Guacamole from source (use Trixie-compatible packages)
RUN set -eu && \
    apt-get update && \
    apt-get --no-install-recommends -y install \
        build-essential \
        libcairo2-dev \
        libjpeg62-turbo-dev \
        libpng-dev \
        libtool-bin \
        pkg-config \
        libossp-uuid-dev \
        libvncserver-dev \
        freerdp3-dev \
        libssh2-1-dev \
        libtelnet-dev \
        libwebsockets-dev \
        libpulse-dev \
        libvorbis-dev \
        libwebp-dev \
        libavcodec-dev \
        libavutil-dev \
        libswscale-dev \
        default-jdk \
        && \
    cd /tmp && \
    wget -q -O /tmp/guacamole-server.tar.gz "https://downloads.apache.org/guacamole/${GUACAMOLE_VERSION}/source/guacamole-server-${GUACAMOLE_VERSION}.tar.gz" && \
    tar -xzf /tmp/guacamole-server.tar.gz -C /tmp && \
    cd "/tmp/guacamole-server-${GUACAMOLE_VERSION}" && \
    CFLAGS="-Wno-error -Wno-deprecated-declarations" ./configure --with-init-dir=/etc/init.d && \
    make -j"$(nproc)" CFLAGS="-Wno-error -Wno-deprecated-declarations" && \
    make install && \
    ldconfig && \
    cd / && \
    rm -rf "/tmp/guacamole-server-${GUACAMOLE_VERSION}" /tmp/guacamole-server.tar.gz && \
    wget -q -O /tmp/tomcat.tar.gz \
        https://archive.apache.org/dist/tomcat/tomcat-9/v9.0.93/bin/apache-tomcat-9.0.93.tar.gz && \
    tar -xzf /tmp/tomcat.tar.gz -C /opt && \
    mv /opt/apache-tomcat-9.0.93 /opt/tomcat && \
    rm /tmp/tomcat.tar.gz && \
    mkdir -p /opt/tomcat/webapps && \
    wget -q -O /opt/tomcat/webapps/guacamole.war \
        "https://downloads.apache.org/guacamole/${GUACAMOLE_VERSION}/binary/guacamole-${GUACAMOLE_VERSION}.war" && \
    chmod +x /opt/tomcat/bin/*.sh && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --chmod=755 ./src /run/
COPY --chmod=755 ./assets /run/assets
COPY --chmod=644 ./guacamole /etc/guacamole/

# Copy the built NoAuth extension from the builder stage
RUN mkdir -p /etc/guacamole/extensions
COPY --from=extension-builder /extension/target/guacamole-auth-noauth-1.6.0.jar /etc/guacamole/extensions/

# Download and install recording storage extension for Guacamole (must match GUACAMOLE_VERSION)
RUN wget -q -O /tmp/recording-storage.tar.gz \
        "https://downloads.apache.org/guacamole/${GUACAMOLE_VERSION}/binary/guacamole-history-recording-storage-${GUACAMOLE_VERSION}.tar.gz" && \
    tar -xzf /tmp/recording-storage.tar.gz -C /tmp && \
    cp "/tmp/guacamole-history-recording-storage-${GUACAMOLE_VERSION}/guacamole-history-recording-storage-${GUACAMOLE_VERSION}.jar" /etc/guacamole/extensions/ && \
    rm -rf /tmp/recording-storage.tar.gz "/tmp/guacamole-history-recording-storage-${GUACAMOLE_VERSION}"

ADD --chmod=664 https://github.com/qemus/virtiso-whql/releases/download/v1.9.48-0/virtio-win-1.9.48.tar.xz /var/drivers.txz

# ARG must be declared before FROM that uses it
ARG VERSION_ARG="VapiorC"

FROM dockurr/windows-arm:${VERSION_ARG} AS build-arm64
FROM build-${TARGETARCH}

# Re-declare ARG after FROM to make it available in this stage
ARG VERSION_ARG="VapiorC"
RUN echo "$VERSION_ARG" > /run/version

VOLUME /storage
EXPOSE 3389 8006 8007 8080

ENV VERSION="11"
ENV RAM_SIZE="4G"
ENV CPU_CORES="2"
ENV DISK_SIZE="64G"
ENV QGA_ENABLE="Y"
ENV QMP_ENABLE="Y"
ENV GUACAMOLE_ENABLE="Y"
ENV GUACAMOLE_HOME="/etc/guacamole"

ENTRYPOINT ["/usr/bin/tini", "-s", "/run/entry.sh"]
