FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/clinks-server ./cmd/server
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/clinks-worker ./cmd/worker

FROM gcr.io/distroless/static-debian13:nonroot
WORKDIR /app
COPY --from=build /out/clinks-server /app/clinks-server
COPY --from=build /out/clinks-worker /app/clinks-worker
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app/clinks-server"]
