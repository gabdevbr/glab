FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /glab ./cmd/glab/

FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /glab /app/glab
COPY --from=builder /build/migrations /app/migrations

RUN mkdir -p /app/uploads

EXPOSE 8080

CMD ["/app/glab"]
