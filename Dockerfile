FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod ./
COPY main.go server.go ./
COPY web ./web
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /out/homelab-savings .

FROM scratch
LABEL org.opencontainers.image.source="https://github.com/tombino104/homelab-savings" \
      org.opencontainers.image.title="Homelab Savings" \
      org.opencontainers.image.licenses="MIT"
ENV PORT=3000 \
    DATA_DIR=/data
COPY --from=build /out/homelab-savings /homelab-savings
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/homelab-savings", "-healthcheck"]
ENTRYPOINT ["/homelab-savings"]
