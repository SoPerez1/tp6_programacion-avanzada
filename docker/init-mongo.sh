#!/usr/bin/env bash
# Inicia el replica set rs0 (necesario para transacciones multi-documento)
# y espera a que el nodo sea primary antes de devolver el control.
set -euo pipefail

HOST="${MONGO_HOST:-mongo:27017}"
RS_NAME="${MONGO_RS:-rs0}"

echo "Esperando a MongoDB en ${HOST}..."
for attempt in $(seq 1 60); do
  if mongosh --host "${HOST}" --quiet --eval "db.adminCommand({ ping: 1 }).ok" | grep -q 1; then
    break
  fi
  if [ "${attempt}" -eq 60 ]; then
    echo "MongoDB no respondió después de 120 segundos" >&2
    exit 1
  fi
  sleep 2
done

if ! mongosh --host "${HOST}" --quiet --eval "rs.status().ok" | grep -q 1; then
  echo "Iniciando replica set ${RS_NAME}..."
  mongosh --host "${HOST}" --quiet --eval \
    "rs.initiate({ _id: '${RS_NAME}', members: [{ _id: 0, host: '${HOST}' }] })"
else
  echo "El replica set ${RS_NAME} ya estaba iniciado."
fi

echo "Esperando a que el nodo sea primary..."
for attempt in $(seq 1 60); do
  if mongosh --host "${HOST}" --quiet --eval "db.hello().isWritablePrimary" | grep -q true; then
    echo "MongoDB listo (${RS_NAME}, primary)."
    exit 0
  fi
  if [ "${attempt}" -eq 60 ]; then
    echo "MongoDB no llegó a primary a tiempo" >&2
    exit 1
  fi
  sleep 2
done
