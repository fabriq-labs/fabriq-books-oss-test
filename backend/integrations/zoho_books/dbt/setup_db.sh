#!/bin/bash

# Load environment variables
export $(grep -v '^#' env | xargs)

# Run schema setup
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f setup_schemas.sql

echo "Schema setup complete!"
