FROM rust:1.78-slim AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src ./src

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash wise
USER wise
WORKDIR /home/wise

COPY --from=builder /app/target/release/wise-server .

ENV HOST=0.0.0.0
ENV PORT=8081

EXPOSE 8081

CMD ["./wise-server"]
