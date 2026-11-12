#!/usr/bin/env bash
# Crea los cuatro topics de negocio y sus DLQ. Es idempotente:
# `--if-not-exists` permite reiniciar el entorno sin borrar datos.
set -euo pipefail

BOOTSTRAP="${KAFKA_BOOTSTRAP:-kafka:9092}"
PARTITIONS="${KAFKA_TOPIC_PARTITIONS:-3}"
REPLICATION="${KAFKA_TOPIC_REPLICATION:-1}"
RETENTION_MS="${KAFKA_TOPIC_RETENTION_MS:-604800000}" # 7 días

TOPICS=(
  activation.requested
  billing.events
  provisioning.events
  activation.events
)

echo "Esperando a Kafka en ${BOOTSTRAP}..."
for attempt in $(seq 1 60); do
  if /opt/kafka/bin/kafka-topics.sh --bootstrap-server "${BOOTSTRAP}" --list >/dev/null 2>&1; then
    break
  fi
  if [ "${attempt}" -eq 60 ]; then
    echo "Kafka no respondió después de 120 segundos" >&2
    exit 1
  fi
  sleep 2
done

for topic in "${TOPICS[@]}"; do
  for candidate in "${topic}" "${topic}.dlq"; do
    /opt/kafka/bin/kafka-topics.sh \
      --bootstrap-server "${BOOTSTRAP}" \
      --create \
      --if-not-exists \
      --topic "${candidate}" \
      --partitions "${PARTITIONS}" \
      --replication-factor "${REPLICATION}" \
      --config cleanup.policy=delete \
      --config retention.ms="${RETENTION_MS}" \
      --config compression.type=producer
  done
done

echo "Topics disponibles:"
/opt/kafka/bin/kafka-topics.sh --bootstrap-server "${BOOTSTRAP}" --list
